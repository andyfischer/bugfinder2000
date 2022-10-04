
import { Graph, QueryExecutionContext } from './Graph'
import { QueryLike, QueryParameters, QueryModifier } from './Query'
import { Stream } from './Stream'
import { StoredQuery } from './StoredQuery'
import { Item, has, get } from './Item'
import { ErrorItem } from './Errors'
import { QueryTuple } from './QueryTuple'
import { unwrapTagged } from './TaggedValue'
import { MountPointRef } from './MountPoint'
import { Trace } from './Trace'
import { Plan3 } from './Plan3'
import { toTagged } from './TaggedValue'

interface ConstructorArgs {
    id?: number
    graph: Graph
    tuple: QueryTuple
    afterVerb: QueryTuple
    parameters: QueryParameters
    input: Stream
    output: Stream
    context: QueryExecutionContext
    plan3?: Plan3
    trace?: Trace
    executionType?: 'normal' | 'schemaOnly'
    schemaOnly?: boolean
}

export class Task {

    id: number // (unique within the PreparedQuery)
    tuple: QueryTuple
    tupleWithoutParams: QueryTuple
    afterVerb: QueryTuple
    parameters: QueryParameters

    graph: Graph
    input: Stream
    output: Stream
    context: QueryExecutionContext

    plan3: Plan3

    incomingSchema: Item[]

    executionType: 'normal' | 'schemaOnly'
    schemaOnly: boolean
    sawUsedMounts: MountPointRef[]

    declaredAsync: boolean
    declaredStreaming: boolean

    trace: Trace

    constructor(args: ConstructorArgs) {
        if (!args.context)
            throw new Error("missing .context");

        this.id = args.id;
        this.graph = args.graph;

        this.tuple = args.tuple;
        this.tupleWithoutParams = args.tuple;
        this.afterVerb = args.afterVerb;

        this.tuple = args.tuple.injectParameters(args.parameters);
        this.parameters = args.parameters;
        this.input = args.input;
        this.output = args.output;
        this.plan3 = args.plan3;
        this.context = args.context;
        this.trace = args.trace;
        this.executionType = args.executionType;
        this.schemaOnly = args.schemaOnly;
    }

    has(attr: string) {
        return this.tuple.has(attr);
    }

    hasValue(attr: string) {
        return (this.tuple.getAttr(attr) !== undefined
                && this.tuple.getAttr(attr).value.t !== 'no_value');
    }
    
    getIncomingSchema() {
        return this.plan3.expectedInput;
    }

    query(queryLike: QueryLike, parameters: QueryParameters = {}) {
        return this.graph.query(queryLike, parameters, this.context);
    }

    queryRelated(modifier: QueryModifier, parameters: QueryParameters = {}) {
        return this.query(this.afterVerb.getRelated(modifier), parameters);
    }

    one(queryLike: QueryLike, parameters: QueryParameters = {}) {
        return this.graph.one(queryLike, parameters);
    }

    attr(attr: string, queryLike: string, parameters: QueryParameters = {}) {
        return this.graph.oneAttr(attr, queryLike, parameters);
    }

    // renamed to: attr
    oneAttr(attr: string, queryLike: string, parameters: QueryParameters = {}) {
        return this.graph.oneAttr(attr, queryLike, parameters);
    }

    argsQuery(): QueryTuple {
        return this.afterVerb;
    }

    args() {
        const out: any = {};

        const argsQuery = this.argsQuery();

        if (argsQuery) {
            for (const tag of this.argsQuery().tags) {
                out[tag.attr] = this.getOptional(tag.attr, null);
            }
        }

        return out;
    }

    get(attr: string): string | null {
        const tag = this.tuple.getAttr(attr);

        if (!tag)
            throw new Error("No tag for: " + attr);

        const tval = tag && tag.value;

        if (!tval || tval.t === 'no_value')
            throw new Error("No value for: " + attr);

        return unwrapTagged(tval);
    }

    getOptional(attr: string, defaultValue: any) {

        const tag = this.tuple.getAttr(attr);

        if (!tag)
            return defaultValue;

        const tval = tag && tag.value;

        if (!tval || tval.t === 'no_value')
            return defaultValue;

        return unwrapTagged(tval);
    }

    getInt(attr: string) {
        return parseInt(this.get(attr), 10);
    }

    getOptionalInt(attr: string, defaultValue: number) {
        let value = this.getOptional(attr, defaultValue);
        return parseInt(value, 10);
    }

    getEnv(attr: string) {
        if (!this.context || !this.context.env)
            return null;

        const val = this.context.env[attr];
        if (val == null)
            return null;

        return val;
    }

    putHeader(obj: Item) {
        this.output.putHeader(obj);
    }

    put(obj: Item) {
        this.output.put(obj);
    }

    putError(obj: ErrorItem) {
        this.output.putError(obj);
    }

    callPrepared(stored: StoredQuery, values: { [attr: string]: any } = {}) {
        return this.graph.callPrepared(stored, values);
    }

    done() {
        this.output.done();
    }

    async() {
        this.declaredAsync = true;
    }

    streaming() {
        this.declaredStreaming = true;
    }

    extractRelevantParameters(): QueryParameters {
        const params = {};
        const fullQueryParameters = this.parameters;

        for (const tag of this.tupleWithoutParams.tags)
            if (fullQueryParameters[tag.attr] !== 'undefined')
                params[tag.attr] = fullQueryParameters[tag.attr];

        return params;
    }

    tupleWithInjectedParameters() {
        const params = this.parameters;

        const injected = this.tuple.remapTags(tag => {
            if (has(params, tag.attr))
                return { t: 'tag', attr: tag.attr, value: toTagged(get(params, tag.attr)) };

            return tag;
        });

        return injected;
    }
}

