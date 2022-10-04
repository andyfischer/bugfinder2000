
import { SchemaItem } from './Stream'
import { QueryParameters } from './Query'
import { QueryTuple } from './QueryTuple'
import { Stream } from './Stream'
import { findVerbForTuple } from './Plan'
import { Graph } from './Graph'
import { Trace } from './Trace'
import { findBestPointMatch, errorForNoTableFound } from './FindMatch'
import { unwrapTagged } from './TaggedValue'
import { has, get } from './Item'
import { NativeCallback } from './NativeCallback'
import { Task } from './Step'
import { QueryExecutionContext } from './Graph'
import { ErrorItem } from './Errors'
import { runNativeFunc2 } from './NativeCallback'
import { MountPoint } from './MountPoint'
import { Verb } from './verbs/_shared'
import { toStructuredString } from './Debug'
import { formatItem } from './format/formatItem'
import { completePlanJoinVerb, JoinPlan } from './Join'
import { VerboseLogEveryPlanExecution } from './config'
import { IndentPrinter } from './utils/IndentPrinter'

/*
 
Runtime query execution process:

PREPARE INPUTS phase
 - Collect inputs (either from query or params)
 - Expand query to include "assume include" tags (is this planning?)
 - Check if required params are provided
   - ERROR if not
 
PRE RUN MATCH CHECK
 
 - If an attr is overprovided
   - Modify inputs to not send a value for that attr
   - Include a performance warning

PRE RUN
 - Output schema

ERROR EARLY EXIT
 - If there's an error, output error message and stop

RUN
 - Call native func
 - Or perform custom verb
 - Or perform join logic

POST FILTER
 - If attr is overprovided, then drop items that don't match the filter

POST RESHAPE
 - Reorder the object to match the query
 - Remove attrs that aren't requested by the query
   - Second filter: Drop the item if none of its attrs were requested
 - Assign attrs that are missing in the item but present in the query (or params)
   - Don't include query attrs that are optional & unused in the mount
 */

export interface NoInputExpected {
    t: 'no_value'
}

export interface SomeInputExpected {
    t: 'some_value'
}

export interface ExpectedSingleValue {
    t: 'expected_value'
    value: QueryTuple
}

export interface ExpectedUnionValue {
    t: 'expected_union'
    values: QueryTuple[]
}

export type ExpectedValue = NoInputExpected | SomeInputExpected | ExpectedSingleValue | ExpectedUnionValue

export class Plan3 {
    // Context
    graph: Graph
    tuple: QueryTuple
    verb: string
    context: QueryExecutionContext
    trace: Trace
    expectedInput: ExpectedValue

    // Derived context, used during planning.
    afterVerb: QueryTuple
    point: MountPoint
    expectedOutput: ExpectedValue

    // Runtime data:

    // Check/prepare inputs
    checkRequiredParams: string[]
    overprovidedAttrs: string[]
    paramsFromQuery: Map<string,any>

    // Start results
    outputSchema: SchemaItem

    // Run mount
    nativeCallback: NativeCallback | null
    joinPlan?: JoinPlan

    // Post filter
    outputFilters: OutputFilter[]

    // Exceptional cases
    knownError?: ErrorItem
}

export type OutputFilter = OutputFilterReshape | OutputFilterWhereAttrsEqual

export interface OutputFilterReshape {
    t: 'reshape'
    shape: OutputAttr[]
}

export interface OutputFilterWhereAttrsEqual {
    t: 'whereAttrsEqual'
    attrs: Array<OutputAttrConstant | OutputAttrFromParam>
}

type OutputAttr = OutputAttrFromItem | OutputAttrFromParam | OutputAttrConstant;

interface OutputAttrFromItem {
    t: 'from_item'
    attr: string
}

interface OutputAttrFromParam {
    t: 'from_param'
    attr: string
}

interface OutputAttrConstant {
    t: 'constant'
    attr: string
    value: any
}

type ExecutionType = 'normal' | 'schemaOnly'

export function createPlan(graph: Graph, context: QueryExecutionContext, tuple: QueryTuple, expectedInput: ExpectedValue): Plan3 {

    const trace = new Trace();

    const { verbDef, verbName, afterVerb } = findVerbForTuple(graph, tuple, expectedInput);

    const plan: Plan3 = {
        graph,
        context,
        tuple,
        trace,
        expectedInput,
        verb: verbName || verbDef.name,
        afterVerb,
        point: null,
        checkRequiredParams: [],
        paramsFromQuery: new Map(),
        overprovidedAttrs: [],
        outputSchema: null,
        nativeCallback: null,
        outputFilters: [],
        expectedOutput: null,
    }

    validatePlan(plan);

    if (plan.verb === 'get') {
        // future refactor: findBestPointMatch doesn't need to worry about the overprovided check
        const match = findBestPointMatch(graph, trace, tuple);
        const point = match?.point;
        completePlanGetVerb(plan, point);
    } else if (plan.verb === 'join') {
        completePlanJoinVerb(plan);
    } else {
        completePlanAltVerb(plan, verbDef);
    }

    validatePlan(plan);

    return plan;
}

function completePlanGetVerb(plan: Plan3, point: MountPoint) {
    if (!point) {
        plan.expectedOutput = { t: 'some_value' };
        plan.knownError = errorForNoTableFound(plan.graph, plan.trace, plan.tuple);
        return plan;
    }

    plan.point = point;

    // Check/prepare inputs
    const outputShape: OutputAttr[] = []
    plan.outputFilters.push({ t: 'reshape', shape: outputShape });
    let overprovidedFilter: OutputFilterWhereAttrsEqual = null;

    // Check each tag requested by query
    for (const queryTag of plan.tuple.tags) {
        const attr = queryTag.attr;
        const mountTag = point.attrs[attr];
        const queryProvidesValue = queryTag.value.t !== 'no_value';
        const queryProvidedValue = queryProvidesValue ? unwrapTagged(queryTag.value) : null;
        const willHaveValueForThisAttr = queryProvidesValue || queryTag.identifier;

        let isRequiredParam = false;
        if (mountTag && mountTag.requiresValue && !queryProvidesValue)
            isRequiredParam = true;

        if (queryTag.identifier && !queryProvidesValue)
            isRequiredParam = true;

        if (isRequiredParam)
            plan.checkRequiredParams.push(attr);

        if (queryProvidesValue)
            plan.paramsFromQuery.set(attr, queryProvidedValue);

        if (plan.graph.enableOverprovideFilter) {
            if (willHaveValueForThisAttr && mountTag && (!mountTag.requiresValue && !mountTag.acceptsValue)) {
                plan.overprovidedAttrs.push(attr);

                if (!overprovidedFilter) {
                    overprovidedFilter = { t: 'whereAttrsEqual', attrs: [] }
                    plan.outputFilters.push(overprovidedFilter);
                }

                if (queryProvidesValue)
                    overprovidedFilter.attrs.push({ t: 'constant', attr, value: queryProvidedValue });
                else
                    overprovidedFilter.attrs.push({ t: 'from_param', attr });
            }
        }

        if (!mountTag) {
            // Query has an optional tag and the mount didn't provide it.
        } else if (queryProvidesValue) {
            outputShape.push({ t: 'constant', attr, value: queryProvidedValue})
        } else if (willHaveValueForThisAttr) {
            outputShape.push({ t: 'from_param', attr });
        } else {
            outputShape.push({ t: 'from_item', attr });
        }
    }
    validatePlan(plan);

    plan.expectedOutput = { t: 'expected_value', value: plan.afterVerb }
    plan.outputSchema = plan.afterVerb.toItemValue();
    plan.nativeCallback = point.callback;
    validatePlan(plan);
}

function completePlanAltVerb(plan: Plan3, verb: Verb) {
    plan.nativeCallback = verb.run;
    plan.expectedOutput = getExpectedOutputWithSchemaOnlyExecution(plan);
}

function getExpectedOutputWithSchemaOnlyExecution(plan: Plan3): ExpectedValue {

    const input = new Stream();

    switch (plan.expectedInput.t) {
        case 'expected_value':
            input.put(plan.expectedInput.value.toItemValue());
            break;
        case 'expected_union':
            for (const item of plan.expectedInput.values)
                input.put(item);
            break;
    }

    input.done();

    const output = new Stream();
    executePlan(plan, {}, input, output, 'schemaOnly');

    if (!output.isDone()) {
        throw new Error(`schemaOnly execution didn't finish synchronously (verb=${plan.verb}, tuple=${plan.tuple.toQueryString()})`);
    }

    const values = output.take();

    if (values.length === 0)
        return { t: 'no_value' }

    if (values.length > 1) {
        return { t: 'expected_union', values}
    }

    let value = values[0];

    if (value.t !== 'queryTuple') {
        value = QueryTuple.fromItem(value);
    }

    return { t: 'expected_value', value }
}

function reshapingFilter(plan: Plan3, parameters: QueryParameters, output: Stream, filter: OutputFilterReshape): Stream {
    const fixed = new Stream(plan.graph, 'reshaping output for: ' + plan.tuple.toQueryString());

    fixed.sendTo({
        receive(evt) {
            switch (evt.t) {
            case 'item': {
                const item = evt.item;
                const fixedItem = {};
                let usedAnyValuesFromItem = false;

                for (const outputAttr of filter.shape) {
                    const attr = outputAttr.attr;
                    switch (outputAttr.t) {
                    case 'from_item':
                        if (has(item, attr)) {
                            fixedItem[attr] = item[attr];
                            usedAnyValuesFromItem = true;
                        } else {
                            fixedItem[attr] = null;
                        }
                        break;
                    case 'from_param': {
                        fixedItem[attr] = parameters[attr];
                        break;
                    }
                    case 'constant':
                        if (has(item, attr)) {
                            fixedItem[attr] = item[attr];
                        } else {
                            fixedItem[attr] = outputAttr.value;
                        }
                        break;
                    }
                }

                if (plan.overprovidedAttrs.length > 0)
                    // Count the item as "used" even if it's shadowed by overprovided query attrs.
                    usedAnyValuesFromItem = true;

                if (usedAnyValuesFromItem)
                    output.put(fixedItem);

                break;
            }
            default:
                output.receive(evt);
            }
        }
    })

    return fixed;
}

function whereAttrsEqualFilter(plan: Plan3, params: QueryParameters, output: Stream, filter: OutputFilterWhereAttrsEqual): Stream {
    const fixed = new Stream(plan.graph, 'reshaping output for: ' + plan.tuple.toQueryString());

    fixed.sendTo({
        receive(evt) {
            switch (evt.t) {
            case 'item': {
                const item = evt.item;

                for (const attrFilter of filter.attrs) {

                    const attr = attrFilter.attr;
                    let valueFromQuery;

                    switch (attrFilter.t) {
                    case 'constant':
                        valueFromQuery = attrFilter.value;
                        break;
                    case 'from_param':
                        valueFromQuery = params[attr];
                        break;
                    }

                    const valueFromItem = get(item, attr);

                    if ((valueFromQuery+'') !== ((valueFromItem)+'')) {
                        return;
                    }
                }
                output.receive(evt);
                break;
            }
            default:
                output.receive(evt);
            }
        }
    })

    return fixed;
}

export function executePlan(plan: Plan3, parameters: QueryParameters, input: Stream, output: Stream, executionType: ExecutionType = 'normal') {

    if (VerboseLogEveryPlanExecution) {
        let prefix = 'Executing plan:'
        dumpPlan({plan, parameters, prefix, executionType});
    }

    if (plan.knownError) {
        output.sendErrorItem(plan.knownError);
        output.done();
        return;
    }

    // Check for required parameters
    for (const attr of plan.checkRequiredParams) {
        if (!has(parameters, attr)) {
            output.sendErrorItem({ errorType: 'missing_parameter', data: [{ missingParameterFor: attr }] });
            output.done();
            return;
        }
    }

    let taskOutput = output;

    for (const filter of plan.outputFilters) {
        switch (filter.t) {
        case 'reshape':
            taskOutput = reshapingFilter(plan, parameters, taskOutput, filter);
            break;
        case 'whereAttrsEqual':
            taskOutput = whereAttrsEqualFilter(plan, parameters, taskOutput, filter);
            break;
        }
    }

    const task = new Task({
        graph: plan.graph,
        tuple: plan.tuple,
        afterVerb: plan.afterVerb,
        parameters,
        input,
        output: taskOutput,
        context: plan.context,
        plan3: plan,
        trace: null,
        executionType,
        schemaOnly: executionType === 'schemaOnly',
    });

    if (plan.verb !== 'get')
        task.streaming(); // awkward special case - verbs assume streaming

    if (plan.outputSchema)
        task.output.receive({ t: 'schema', item: plan.outputSchema });

    runNativeFunc2(task, plan.nativeCallback);
}

function validatePlan(plan: Plan3) {
    if (plan.expectedOutput?.t === 'expected_value') {
        if ((plan as any).expectedOutput.value.t !== 'queryTuple') {
            console.error('wrong type: ', plan.expectedOutput.value);
            throw new Error("plan.expectedOutput has wrong type");
        }
    }
}

interface DumpPlanOptions {
    plan: Plan3
    prefix?: string
    printer?: IndentPrinter
    parameters?: QueryParameters
    executionType?: ExecutionType
}

export function dumpPlan(opts: DumpPlanOptions) {
    const { plan } = opts;
    const printer = opts.printer || new IndentPrinter();
    printer.log(`${opts.prefix || 'Plan:'} (${plan.tuple ? plan.tuple.toQueryString(): ''}):`)
    printer.indent();
    if (opts.parameters)
        printer.log(`parameters = ${formatItem(opts.parameters)}`);
    if (opts.executionType)
        printer.log(`executionType = ${opts.executionType}`);
    printer.log(`expectedInput = ${toStructuredString(plan.expectedInput)}`)
    printer.log(`expectedOutput = ${toStructuredString(plan.expectedOutput)}`)
    printer.log(`verb = ${plan.verb}`)
    printer.log(`afterVerb = ${plan.afterVerb.toQueryString()}`)
    printer.log(`point = ${plan.point ? plan.point.toDeclString() : '(none)'}`)

    if (plan.knownError)
        printer.log(`knownError = ${formatItem(plan.knownError)}`)

    if (plan.checkRequiredParams.length > 0)
        printer.log(`checkRequiredParams = ${plan.checkRequiredParams}`)

    if (plan.overprovidedAttrs.length > 0)
        printer.log(`overprovidedAttrs = ${plan.overprovidedAttrs}`)

    if (plan.paramsFromQuery.size > 0)
        printer.log(`paramsFromQuery = ${plan.paramsFromQuery}`)

    printer.log(`outputFilters = ${JSON.stringify(plan.outputFilters)}`)

    if (plan.joinPlan) {
        printer.indent();
        if (plan.joinPlan.staticSearchTuple) {
            printer.log(`Join search type = static`);
            printer.log(`Join search = ` + plan.joinPlan.staticSearchTuple.toQueryString());
            printer.log(`Join match = ` + plan.joinPlan.staticPoint.toDeclString());
        } else {
            printer.log(`Join search type = dynamic`);
        }
        if (plan.joinPlan.rhsPlan)
            dumpPlan({ prefix: 'Join rhsPlan:', plan: plan.joinPlan.rhsPlan, printer });
        printer.unindent();
    }
    printer.unindent();
}

export function runtimePlanAndExecute(step: Task, tuple: QueryTuple, input: Stream | null, output: Stream) {
    input = input || Stream.newEmptyStream();
    const plan = createPlan(step.graph, step.context, tuple, { t: 'no_value' });

    if (VerboseLogEveryPlanExecution)
        dumpPlan({ plan, prefix: 'Runtime plan and execute:', executionType: step.executionType });

    if (step.executionType === 'schemaOnly') {
        output.receive({ t: 'schema', item: plan.outputSchema });
        output.done();
        return;
    }

    executePlan(plan, step.parameters, Stream.newEmptyStream(), output, step.executionType);
}

export function runtimePlanAndExecute2(graph: Graph, context: QueryExecutionContext, tuple: QueryTuple, parameters: QueryParameters, input: Stream | null, output: Stream) {
    const plan = createPlan(graph, context, tuple, { t: 'no_value' });

    if (VerboseLogEveryPlanExecution)
        dumpPlan({ plan, prefix: 'runtimePlanAndExecute2:' });

    executePlan(plan, parameters, Stream.newEmptyStream(), output);
}
