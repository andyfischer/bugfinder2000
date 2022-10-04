
import { IDSource } from './utils/IDSource'
import { Table } from './Table'
import { Stream } from './Stream'
import { Module } from './Module'
import { Task } from './Step'
import { QueryLike, toQuery, Query, QueryParameters, queryLikeToString } from './Query'
import { QueryTuple } from './QueryTuple'
import { StoredQuery } from './StoredQuery'
import { setupMap, MapMountConfig, setupObject, ObjectMountConfig, getListMount, ListMountConfig,
    getTableMount, TableMountConfig, setupFunction } from './mountlib'
import { LooseTableSchema, fixLooseSchema } from './Schema'
import { ItemChangeListener } from './reactive/ItemChangeEvent'
import { randomHex } from './utils/randomHex'
import { applyTransform } from './Transform'
import { Item } from './Item'
import { setupBrowse } from './mountlib/browseGraph'
import { ItemCallback } from './Setup'
import { MountPointRef } from './MountPoint'
import { graphToString } from './Debug'
import { Provider, newProviderTable } from './Providers'
import { Failure, recordFailure, FailureAttrs } from './FailureTracking'
import { MountPoint, MountPointSpec } from './MountPoint'
import { setupLoggingSubsystem, EmptyLoggingSubsystem } from './LoggingSubsystem'
import { getQueryMountMatch } from './FindMatch'
import { Verb } from './verbs/_shared'
import { getVerb } from './verbs/_list'
import { Trace } from './Trace'
import { setupFunctionWithJavascriptMagic } from './JavascriptMagic'
import { BuiltinTables } from './BuiltinOptional'
import { Handler } from './Handler'
import { createMultiStepPlan, executeMultiStepPlan, MultiStepPlan } from './MultiStepPlan'

let _nextGraphID = new IDSource('graph-');

export interface QueryExecutionContext {
    env?: {
        [key: string]: any
    }
    readonly?: boolean
    trace?: Trace
    resourceTags?: string[]
    [key: string]: any
}

type HookNativeFunc = (step: Task) => { t: 'continue' } | { t: 'done' }

export interface Queryable {
    query: (query: QueryLike, params?: QueryParameters, context?: QueryExecutionContext) => Stream
}

export type BeforeQueryCallback = (query: Query, params: QueryParameters, plan: MultiStepPlan) => void

export class Graph implements Queryable {
    graphId: string
    tracingName?: string
    anonTableName = new IDSource('anontable-');
    nextTableId = new IDSource('table-');
    nextModuleId = new IDSource('module-');
    nextListenStreamId = new IDSource('listen-stream-');
    nextResourceTag = new IDSource('resource-');
    beforeEveryQuery: BeforeQueryCallback[] = []
    modules: Module[] = [];
    modulesById = new Map<string, Module>();
    tables = new Map<string, Table>()
    tablesByName = new Map<string, Table>()
    schemaListeners: ItemChangeListener[] = []
    providerTable: Table<Provider>
    queryPlanCache: Map<string, MultiStepPlan>
    hookNativeFunc?: HookNativeFunc
    enableOverprovideFilter: boolean

    builtins = new BuiltinTables()

    // Failures
    silentFailures = false
    failureTable: Table<Failure>

    logging = new EmptyLoggingSubsystem()
    customVerbs: Table<{ name: string, def: Verb}>

    constructor() {
        this.graphId = _nextGraphID.take() + randomHex(6);
    }

    // Graph configuration //

    setupBrowse() {
        this.mount(setupBrowse(this));
    }

    enableLogging() {
        setupLoggingSubsystem(this);
    }

    enablePlanCache() {
        if (!this.queryPlanCache)
            this.queryPlanCache = new Map();
    }

    // Browsing //
    
    tablesIt() {
        return this.tables.values();
    }

    *everyMountPoint() {
        for (const module of this.modules)
            yield* module.points;
    }

    *getQueryMountMatches(tuple: QueryTuple) {
        for (const point of this.everyMountPoint()) {
            const match = getQueryMountMatch(null, tuple, point);

            if (match)
                yield {point,match};
        }
    }

    getMountPoint(ref: MountPointRef): MountPoint {
        const module = this.modulesById.get(ref.moduleId);
        if (!module)
            return null;
        return module.pointsById.get(ref.pointId);
    }

    findTableByName(name: string) {
        for (const module of this.modules)
            for (const table of module.points)
                if (table.name === name)
                    return table;
        return null;
    }

    providers(): Table<Provider> {
        if (!this.providerTable)
            this.providerTable = newProviderTable(this);

        return this.providerTable;
    }

    // Table setup //
    addTable(table: Table, opts: TableMountConfig = {}) {
        const schema = table.schema;

        if (this.tablesByName.has(table.name)) {
            throw new Error("Already have a table with name: " + table.name);
        }

        const id = table.tableId || this.nextTableId.take();
        
        this.tables.set(id, table);
        this.tablesByName.set(table.name, table);
        this.mountTable(table, opts);
        this.onModuleChange();
    }

    newTable<T = any>(schema?: LooseTableSchema): Table<T> {
        schema = schema || {};
        schema.name = schema.name || this.anonTableName.take();

        schema = fixLooseSchema(schema);
        const tableId = this.nextTableId.take();
        const table = new Table<T>(schema, { tableId });

        this.addTable(table);

        return table;
    }

    // Module setup //
    createEmptyModule() {
        const module = new Module(this);
        this.modules.push(module);
        this.modulesById.set(module.moduleId, module);
        return module;
    }

    mount(points: (MountPointSpec | Handler)[]) {
        const module = this.createEmptyModule();
        module.redefine(points);
        this.onModuleChange();
        return module;
    }

    mountMap(config: MapMountConfig) {
        this.mount(setupMap(config));
    }

    mountObject(config: ObjectMountConfig) {
        return this.mount(setupObject(config));
    }

    mountList(config: ListMountConfig) {
        const module = this.createEmptyModule();
        module.redefine(getListMount(config));
        return module;
    }

    func(decl: string, func: Function): { handler: Handler, module: Module } {
        const handler = setupFunctionWithJavascriptMagic(decl, func);
        const module = this.mount([handler]);
        return { handler, module }
    }

    funcv2(decl: string, callback: ItemCallback) {
        return this.mount([setupFunction(decl, callback)]);
    }

    mountTable(table: Table, opts: TableMountConfig = {}) {
        const module = this.createEmptyModule();
        module.redefine(getTableMount(table, opts));
        this.onModuleChange();
        return module;
    }

    addProvider(run: (q: Query, i: Stream) => Stream): Provider {
        const provider = this.providers().put({
            runQuery: run
        });
        this.onModuleChange();
        return provider;
    }

    addSchemaListener(listener: ItemChangeListener, { backlog }: { backlog?: boolean } = {}) {
        if (backlog) {
            for (const module of this.modules) {
                module.sendUpdate(listener);
            }
        }

        this.schemaListeners.push(listener);
    }

    addCustomVerb(name: string, def: Verb) {
        if (!this.customVerbs) {
            this.customVerbs = this.newTable({
                funcs: [
                    'name -> def'
                ]
            });
        }
    
        this.customVerbs.put({name, def});
        this.onModuleChange();
    }

    getVerb(name: string) {
        if (this.customVerbs) {
            const foundCustom = this.customVerbs.one({name});
            if (foundCustom)
                return foundCustom.def;
        }

        return getVerb(name);
    }

    onModuleChange() {
        if (this.queryPlanCache)
            this.queryPlanCache.clear();
    }

    // Query //

    query(queryLike: QueryLike, params: QueryParameters = {}, context: QueryExecutionContext = {}) {

        if (params && params['$input'] && !params['$input'].isStream())
            throw new Error('$input is not a valid stream');

        if (this.isAltImplEnabled('always_cache_plan'))
            this.enablePlanCache();

        const query = toQuery(queryLike, { graph: this });
        const plan = createMultiStepPlan(this, context, query);

        for (const callback of this.beforeEveryQuery) {
            callback(query, params, plan);
        }

        const input = (params && params['$input']) || Stream.newEmptyStream();
        const output = new Stream();
        executeMultiStepPlan(plan, params, input, output);
        return output;

        /*
        if (this.queryPlanCache) {
            queryAsString = queryLikeToString(queryLike);
            plan = this.queryPlanCache.get(queryAsString);
        }

        if (!plan) {
            plan = new QueryPlan(this, query, context);

            if (this.queryPlanCache) {
                this.queryPlanCache.set(queryAsString, plan);
            }
        }

        return performQuery(plan, params, context);
        */
    }

    // Convenience calls on query() //
    one(queryLike: QueryLike, params: QueryParameters = {}, context: QueryExecutionContext = {}) {
        return one(this, queryLike, params, context);
    }

    oneAttr(attr: string, queryLike: string, params: QueryParameters = {}, context: QueryExecutionContext = {}) {
        return oneAttr(this, attr, queryLike, params, context);
    }

    transform(queryLike: QueryLike, items: Item[], params: QueryParameters = {}, context: QueryExecutionContext = {}) {
        params.$input = Stream.fromList(items);
        return this.query(queryLike, params, context);
    }

    trace(queryLike: QueryLike, params: QueryParameters = {}) {
        const trace = new Trace();
        const output = this.query(queryLike, params, { trace });
        return { output, trace }
    }

    put(object: any): Stream {
        return this.query({
            attrs: {
                ...object,
                'put!': null,
            }
        });
    }

    logTrace(queryLike: QueryLike, params: QueryParameters = {}) {
        const trace = new Trace();
        const output = this.query(queryLike, params, { trace });
        console.log(trace.str());
    }

    applyTransform(items: Item[], queryLike: QueryLike): Stream {
        return applyTransform(this, items, this.prepareTransform(queryLike));
    }

    // Query preperation //

    prepareQuery(queryLike: QueryLike): Query {
        return toQuery(queryLike, { graph: this });
    }

    prepareTransform(queryLike: QueryLike): Query {
        return toQuery(queryLike, { graph: this });
    }

    callPrepared(prepared: StoredQuery, values: { [attr: string]: any }): Stream {
        const query = prepared.withValues(values);
        return this.query(query);
    }

    // Testing

    recordFailure(failure_id: string, attrs: FailureAttrs = {}) {
        return recordFailure(failure_id, { ...attrs, graph: this });
    }

    isAltImplEnabled(name: string) {
        return this.builtins.altImpl().one({ name })?.enabled;

        if (!this.builtins.has('alt_impl'))
            return false;

        return this.builtins.altImpl().one({ name })?.enabled;
    }

    setAlternateImplEnabled(name: string, enabled: boolean) {
        const item = this.builtins.altImpl().one({ name });
        if (item)
            item.enabled = enabled;
        else
            this.builtins.altImpl().put({ name, enabled });
    }
    
    // Utilities //
    newStream(label?: string) {
        return new Stream(this, label);
    }

    newTrace() {
        return new Trace();
    }

    newGraph() {
        return new Graph();
    }

    // Debugging //
    str(options: { reproducible?: boolean } = {}) {
        return graphToString(this, options);
    }
}

export function newGraph() {
    return new Graph();
}

// Convenience helpers for query()
export function one(graph: Queryable, queryLike: QueryLike, params: QueryParameters = {}, context: QueryExecutionContext = {}) {
    const output = graph.query(queryLike, params, context);
    const value = output.one();
    value.originalQuery = queryLike;
    return value;
}

export function oneAttr(graph: Queryable, attr: string, queryLike: string, params: QueryParameters = {}, context: QueryExecutionContext = {}) {
    if (typeof queryLike !== 'string')
        throw new Error("unsupported: oneAttr only works for string queries right now");

    const query = attr + ' ' + queryLike;
    const value = one(graph, query, params, context);
    return value.attr(attr);
}
