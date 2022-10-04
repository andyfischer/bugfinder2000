
import { Plan3 } from './Plan3'
import { findBestPointMatch } from './FindMatch'
import { QueryTuple } from './QueryTuple'
import { MountPoint } from './MountPoint'
import { Task } from './Step'
import { createPlan, executePlan, OutputFilterReshape, dumpPlan } from './Plan3'
import { Stream } from './Stream'
import { entries, has } from './Item'
import { toTagged } from './TaggedValue'
import { VerboseLogEveryPlanExecution } from './config'

export interface JoinPlan {
    plan: Plan3

    staticSearchTuple?: QueryTuple
    staticPoint?: MountPoint
    rhsPlan?: Plan3
}

export function completePlanJoinVerb(plan: Plan3) {
    // Check if we can query the RHS separately.
    
    const match = findBestPointMatch(plan.graph, plan.trace, plan.tuple);
    const point = match?.point;

    if (point) {
        // todo: implement side-by-side join.
    }

    const joinPlan: JoinPlan = {
        plan,
    }
    plan.joinPlan = joinPlan;

    // Prepare a fanout match
    const expectedLhs = plan.expectedInput;

    // Try to statically find the search query.
    const rhsSearch = plan.afterVerb.shallowCopy();

    if (expectedLhs.t === 'expected_value') {
        for (const expectedInputTag of expectedLhs.value.tags) {
            const attr = expectedInputTag.attr;

            rhsSearch.addOrOverwriteTag({ t: 'tag', attr, identifier: attr, isOptional: true, value: expectedInputTag.value });
        }
    }

    const staticMatch = findBestPointMatch(plan.graph, plan.trace, rhsSearch);
    const staticPoint = staticMatch?.point;

    if (staticPoint) {
        joinPlan.staticSearchTuple = rhsSearch;
        joinPlan.staticPoint = staticPoint;
        joinPlan.rhsPlan = createPlan(plan.graph, plan.context, rhsSearch, {t: 'no_value'});

        // Include fixed query values from the LHS
        if (expectedLhs.t === 'expected_value') {
            for (const lhsTag of expectedLhs.value.tags) {
                const attr = lhsTag.attr;

                let outputShape = (joinPlan.rhsPlan.outputFilters.find(filter => filter.t === 'reshape') as OutputFilterReshape);

                if (!outputShape) {
                    throw new Error("join RHS search didn't have a reshape filter?");
                }

                let alreadyFoundInShape = false;
                for (const reshapeAttr of outputShape.shape) {
                    if (attr === reshapeAttr.attr) {
                        alreadyFoundInShape = true;
                        break;
                    }
                }

                if (alreadyFoundInShape)
                    continue;

                outputShape.shape.push({t: 'from_item', attr});// , value: unwrapTagged(lhsTag.value) });

            }
        }

        plan.nativeCallback = callbackForStaticJoin(plan);
        plan.expectedOutput = { t: 'expected_value', value: rhsSearch }
    } else {
        plan.nativeCallback = callbackForDynamicJoin(plan);
        plan.expectedOutput = { t: 'some_value' }
    }
}

export function callbackForStaticJoin(plan: Plan3) {

    const graph = plan.graph;
    const rhsPlan = plan.joinPlan.rhsPlan;
    return (task: Task) => {
        task.input.streamingTransform(task.output, lhsItem => {
            const input = Stream.newEmptyStream();
            const output = graph.newStream();
            
            const planOutput = graph.newStream("fixing output on join (static)");
            planOutput.sendTo({
                receive(evt) {
                    switch (evt.t) {
                    case 'item':
                        const fixedItem = { ...evt.item };
                        for (const [ attr, value ] of entries(fixedItem)) {
                            if (value == null && has(lhsItem, attr))
                                fixedItem[attr] = lhsItem[attr];
                        }
                        output.receive({ t: 'item', item: fixedItem });
                        break;
                    default:
                        output.receive(evt);
                    }
                }
            });

            executePlan(rhsPlan, {
                ...lhsItem,
                ...task.parameters
            }, input, planOutput);

            return output;
        });
    }
}

export function callbackForDynamicJoin(plan: Plan3) {

    const graph = plan.graph;
    const context = plan.context;
    const tuple = plan.afterVerb;

    return (task: Task) => {
        task.input.streamingTransform(task.output, lhsItem => {

            const rhsSearch = tuple.shallowCopy(); 

            for (const [attr,value] of entries(lhsItem)) {
                rhsSearch.addOrOverwriteTag({
                    t: 'tag', attr, identifier: attr, isOptional: true, value: toTagged(value)
                });
            }

            const rhsPlan = createPlan(graph, context, rhsSearch, {t: 'no_value'});

            if (VerboseLogEveryPlanExecution) 
                dumpPlan({plan: rhsPlan, prefix: 'Executing join RHS plan (dynamic):'});

            const input = Stream.newEmptyStream();
            const output = new Stream();
            
            const planOutput = graph.newStream("fixing output on join (static)");
            planOutput.sendTo({
                receive(evt) {
                    switch (evt.t) {
                    case 'item':
                        const fixedItem = { ...evt.item };
                        for (const [ attr, value ] of entries(fixedItem)) {
                            if (value == null && has(lhsItem, attr))
                                fixedItem[attr] = lhsItem[attr];
                        }
                        output.receive({ t: 'item', item: fixedItem });
                        break;
                    default:
                        output.receive(evt);
                    }
                }
            });

            executePlan(rhsPlan, {
                ...lhsItem,
                ...task.parameters
            }, input, planOutput);

            return output;
        });
    }
}
