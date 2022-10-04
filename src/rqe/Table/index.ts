
import { randomHex } from '../utils/randomHex'
import { TableSchema, OnDeleteOption, OnConflictOption, Reference,
    AttrGenerationMethod } from '../Schema'
import { Graph, QueryExecutionContext } from '../Graph'
import { ItemChangeListener } from '../reactive/ItemChangeEvent'
import { fixLooseSchema, findUniqueAttr, LooseTableSchema, IndexConfiguration } from '../Schema'
import TableIndex from './TableIndex'
import { IDSourceNumber as IDSource } from '../utils/IDSource'
import { formatItem } from '../format/formatItem'
import { assert } from '../utils/assert'
import { MemoryTableExtraErrorMessages } from '../config'
import { ErrorItem, newErrorTable, errorItemToOneLineString, newErrorFromItems, ErrorExtended, collectErrorItems } from '../Errors'
import { tableSchemaToString } from '../Debug'
import { initRowInfo, withoutHeader, clearHeader, header, itemGlobalId } from './ObjectHeader'
import { Constraint } from './Constraints'
import { QueryLike } from '../Query'
import { Stream } from '../Stream'
import { formatTable } from '../format/TableFormatter'
import { has, get, Item } from '../Item'
import { StreamEvent, StreamReceiver } from '../Stream'
import { tableReceiveStreamEvent } from './receiveStream'
import { Task } from '../Step'
import { trackNewListenStream } from '../Listeners'

const ConfigFrequentValidation = true;

function* iteratorMap<I,O>(it: Iterable<I>, callback: (val: I) => O) {
    for (const item of it)
        return callback(item);
}

type ConstraintType = 'unique'
export type AttrMap = Map<string, any>;
export type AttrSet = Map<string, true>;
export type LooseAttrList = string | string[]

interface GeneratedValue {
    attr: string
    prefix: string
    method: AttrGenerationMethod
    length: number
    nextId: number
}

interface ReferenceType {
    table: Table
}

interface Filter {
    conditions: WhereCondition[]
}

interface WhereCondition {
    attr: string
    value: any
}

function parseAttrList(attrSet: LooseAttrList): Map<string, true> {
    const map = new Map<string, true>();
    if (Array.isArray(attrSet))
        for (const attr of attrSet)
            map.set(attr, true);
    else
        map.set(attrSet, true);

    return map;
}

function toArray(looseList: string | string[]): string[] {
    if (typeof looseList === 'string')
        return [looseList];
    return looseList;
}

function attrSetsEqual(a: AttrSet, b: AttrSet) {
    if (a.size !== b.size)
        return false;

    for (const key of Object.keys(a))
        if (!b.get(key))
            return false;

    return true;
}

function parseWhereFilter(input: any): Filter {
    const out: Filter = {
        conditions: []
    }

    for (const k in input) {
        out.conditions.push({
            attr: k,
            value: input[k]
        });
    }

    return out;
}

function objectToMap(obj: any) {
    const map = new Map<string, any>()
    for (const k in obj) {
        if (k === 'rowinfo')
            continue;
        map.set(k, obj[k]);
    }
    return map;
}

function listToMap(list: string[]) {
    const map = new Map<string, true>()
    for (const item of list)
        map.set(item, true);
    return map;
}

interface SetupOptions {
    tableId?: string
    owner?: Graph
}

export class Table<ItemType = any> implements StreamReceiver {

    t = 'table'

    items = new Map<number, ItemType>()

    name: string
    tableId: string
    owner: Graph

    indexes: TableIndex<ItemType>[] = []
    indexesBySingleAttr = new Map<string, TableIndex<ItemType>>()
    constraints: Constraint<ItemType>[] = []
    generatedValues: GeneratedValue[] = []
    schema: TableSchema
    references: Reference[] = []
    itemChangeListeners?: ItemChangeListener[]
    listenerStreams?: Stream[]
    batchListenerStreams?: Stream[]
    primaryUniqueAttr?: string

    isDuringPatch: boolean
    pendingPatchEvents?: StreamEvent[]

    nextInternalID = new IDSource()
    _errors: Table<ErrorItem>
    _headers: Table<Item>

    constructor(looseSchema: LooseTableSchema, setupOptions: SetupOptions = {}) {
        const schema = fixLooseSchema(looseSchema);

        // Freeze incoming schema object.
        Object.freeze(schema.funcs);
        Object.freeze(schema);

        this.owner = setupOptions.owner;
        this.name = schema.name;
        this.schema = schema;
        this.tableId = setupOptions.tableId;

        for (const [attr, attrConfig] of Object.entries(schema.attrs || {})) {
            Object.freeze(attrConfig);

            if (attrConfig.index) {
                this._newIndex({ attrs: [attr] });
            }

            if (attrConfig.unique) {
                this.addUniqueConstraint([attr], attrConfig.unique.onConflict);
            }

            if (attrConfig.required) {
                this.constraints.push({
                    constraintType: 'required_attr',
                    attr,
                });
            }

            if (attrConfig.reference) {
                this.addReference(attr, attrConfig.reference.onDelete);
            }

            if (attrConfig.foreignKey) {
                this.addForeignKey(attr, attrConfig.foreignKey.table,
                                   attrConfig.foreignKey.foreignAttr,
                                   attrConfig.foreignKey.onDelete || 'set_null'
                                  );
            }

            if (attrConfig.generate) {
                this.generatedValues.push({
                    attr,
                    prefix: attrConfig.generate.prefix || '',
                    method: attrConfig.generate.method || 'random',
                    length: attrConfig.generate.length || 6,
                    nextId: 1
                });
            }
        }

        for (const indexConfig of (schema.indexes || [])) {
            Object.freeze(indexConfig);

            if (typeof indexConfig === 'string')
                this._newIndex({ attrs: [indexConfig] });
            else
                this._newIndex(indexConfig);
        }

        for (const referenceConfig of schema.references || []) {
            this.references.push(referenceConfig);
        }

        for (const foreignKeyConfig of schema.foreignKeys || []) {
            this.references.push(foreignKeyConfig);
        }

        const [ primaryUniqueAttr, _] = findUniqueAttr(schema);
        this.primaryUniqueAttr = primaryUniqueAttr;

        for (const item of (schema.initialItems || [])) {
            this.put(item as ItemType);
        }
    }

    size() {
        return this.items.size;
    }

    getEffectiveAttrs(): string[] {
        const attrs = {};
        for (const item of this.scan()) {
            for (const key of Object.keys(item))
                attrs[key] = true;
        }
        return Object.keys(attrs);
    }

    _newIndex(config: IndexConfiguration) {
        const index = new TableIndex<ItemType>(this, config.attrs);
        this.indexes.push(index);

        if (index.attrs.length === 1)
            this.indexesBySingleAttr.set(index.attrs[0], index);

        if (config.unique) {
            const onConflict: OnConflictOption = config.unique === true ? 'error' : config.unique.onConflict;
            this.constraints.push({
                constraintType: 'unique',
                onConflict,
                index,
            });
        }

        return index;
    }

    count() {
        return this.items.size;
    }

    itemToKey(item: ItemType) {
        if (this.primaryUniqueAttr) {
            return { [this.primaryUniqueAttr]: item[this.primaryUniqueAttr] }
        }

        console.error(`can't run itemToKey: `, item);
        throw this.usageError('unsupported: itemToKey needs a primaryUniqueAttr');
    }

    findIndex(attrSet: AttrSet) {
        for (const index of this.indexes) {
            if (attrSetsEqual(attrSet, index.attrSet))
                return index;
        }
        return null;
    }

    addUniqueConstraint(attrs: LooseAttrList, onConflict: OnConflictOption = 'error') {
        if (this.items.size > 0)
            throw new Error("unsupported: can't add constraint after rows are added");

        const attrSet = parseAttrList(attrs);
        let index = this._addIndex(attrs);

        this.constraints.push({
            constraintType: 'unique',
            onConflict,
            index,
        });

        return this;
    }

    addReference(attr: string, onDelete: OnDeleteOption) {
        this.references.push({ attr, onDelete });
        return this;
    }

    addForeignKey(attr: string, table: Table, foreignAttr: string, onDelete: OnDeleteOption) {
        if (!table.hasIndexForAttrs([foreignAttr])) {
            throw this.usageError(`can't addForeignKey, no index for: ${foreignAttr}`);
        }

        this.references.push({ attr, table, foreignAttr, onDelete });
        return this;
    }

    _addIndex(attrs: LooseAttrList) {
        const attrSet = parseAttrList(attrs);
        const existing = this.findIndex(attrSet);
        if (existing)
            return existing;

        return this._newIndex({ attrs: toArray(attrs) });
    }

    addIndex(attrs: LooseAttrList) {
        this._addIndex(attrs);
        return this;
    }

    hasIndexForAttrs(attrs: string[]) {
        const item = {};
        for (const attr of attrs)
            item[attr] = null;

        for (const index of this.indexes) {
            if (index.coversItem(item)) {
                return true;
            }
        }
        return false;
    }

    _beforePut(item: ItemType) {
        for (const generatedId of this.generatedValues) {
            if (item[generatedId.attr])
                continue;

            let value: any;

            switch (generatedId.method) {
            case 'random':
                value = generatedId.prefix + randomHex(generatedId.length);
                break;

            case 'increment':
                value = generatedId.prefix + generatedId.nextId;
                generatedId.nextId++;
                break;

            case 'time_put':
                value = Date.now();
            }

            item[generatedId.attr] = value;
        }
    }

    receive(evt: StreamEvent) {
        tableReceiveStreamEvent(this, evt);
    }

    prepare(newValue?: ItemType): ItemType {
        this._beforePut(newValue || ({} as any));
        return newValue;
    }

    put(newItem: ItemType, putInfo?: any): ItemType {

        if (header(newItem) && header(newItem).table)
            newItem = withoutHeader(newItem);

        if (ConfigFrequentValidation)
            this.internalValidate();

        // Prepare incoming data (add generated elements)
        this._beforePut(newItem);

        let overwriteItem = null;

        // Check constraints
        for (const constraint of this.constraints) {
            switch (constraint.constraintType) {

            case 'required_attr':
                if (!has(newItem, constraint.attr))
                    throw this.usageError("put() failed, missing required attr: " + constraint.attr);
                break;

            case 'unique': {
                const indexKey = constraint.index.toKeyUsingItem(newItem);

                if (!indexKey)
                    continue;

                const existingItems = constraint.index.data.get(indexKey);

                if (existingItems) {
                    switch (constraint.onConflict) {

                    case 'drop_new':
                        return existingItems.values().next().value;

                    case 'overwrite':
                        overwriteItem = existingItems.values().next().value;
                        break;

                    case 'error':
                        throw this.usageError(`put() failed, already have an item with ${constraint.index.attrs}=${indexKey}`);
                    }
                }

                break;
            }
            }
        }

        let tableInternalKey: number;

        // Commit
        if (overwriteItem) {

            tableInternalKey = header(overwriteItem).tableInternalKey;

            // Overwrite an existing object.
            initRowInfo(newItem, header(overwriteItem));

            this.items.set(tableInternalKey, newItem);

            // Update any existing incoming references.
            if (header(overwriteItem).referencers) {
                for (const referencer of header(overwriteItem).referencers.values()) {
                    referencer.value[referencer.attr] = newItem;
                }
            }

            clearHeader(overwriteItem);

        } else {
            tableInternalKey = this.nextInternalID.take()

            initRowInfo(newItem, {
                table: this,
                tableInternalKey,
            });

            this.items.set(tableInternalKey, newItem);
        }

        assert(tableInternalKey, 'missing tableInternalKey in commit');

        // Update any relevant indexes.
        for (const index of this.indexes) {
            if (index.coversItem(newItem)) {
                index.insert(newItem);
            }
        }

        // Update any references that this value points to.
        for (const reference of this.references) {
            const attr = reference.attr;

            const fieldValue = newItem[attr];
            if (fieldValue) {

                let referencedObject;

                if (reference.table) {

                    referencedObject = reference.table.getOneByAttrValue(reference.foreignAttr, fieldValue);
                    if (!referencedObject) {
                        throw new Error(`Table${reference.table.name ? (' ' + reference.table.name) : ''}`
                                        +` doesn't have a value for`
                                        +` ${reference.foreignAttr}=${fieldValue}`);
                    }
                } else {
                    referencedObject = fieldValue;
                }

                const referencedHeader = header(referencedObject);
                if (!referencedHeader)
                    throw this.usageError(`Value at ${attr} isn't a referenceable object`);

                if (!referencedHeader.referencers)
                    referencedHeader.referencers = new Map();

                const globalId = itemGlobalId(referencedHeader);
                referencedHeader.referencers.set(globalId, {
                    value: newItem,
                    attr,
                    onDelete: reference.onDelete
                });
            }
        }

        if (this.itemChangeListeners) {
            const itemData = withoutHeader(newItem);

            for (const listener of (this.itemChangeListeners || [])) {
                listener({ verb: 'put', item: itemData, writer: putInfo && putInfo.writer });
            }
        }

        if (this.listenerStreams) {
            const itemData = withoutHeader(newItem);
            let anyClosed = false;

            for (const listener of (this.listenerStreams || [])) {
                if (listener.isDone()) {
                    anyClosed = true;
                    continue;
                }
                listener.receive({ t: 'item', item: itemData });
            }

            if (anyClosed)
                this.listenerStreams = this.listenerStreams.filter(s => !s.isDone());
        }

        if (ConfigFrequentValidation)
            this.internalValidate();

        return newItem;
    }

    putItems(items: ItemType[]) {
        for (const item of items)
            this.put(item);
    }

    putError(item: ErrorItem) {
        if (!this._errors)
            this._errors = newErrorTable();
        this._errors.put(item);
    }

    putHeader(item: Item) {
        if (!this._headers)
            this._headers = new Table({});
        this._headers.put(item);
    }

    *where(where: any): IterableIterator<ItemType> {
        // Check if this has no clause.
        if (!where) {
            yield* this.scan();
            return;
        }

        // Check if the 'where' is a valid object.
        const itemHeader = header(where);
        if (itemHeader && itemHeader.table === this) {
            yield where;
            return;
        }

        // Find a matching index.
        const attrs = Array.from(Object.keys(where));
        const attrsMap = objectToMap(where); // TODO, don't create a map here?

        for (const index of this.indexes) {
            if (index.matchesAttrList(attrs)) {
                yield* index.get(attrsMap);
                return;
            }
        }

        let message = `where() can't lookup by: [${attrs}]`;

        if (MemoryTableExtraErrorMessages) {

            if (this.indexes.length === 0) {
                message += `\n - Table ${this.name} has no indexes`;
            } else {
                message += `\n - Table ${this.name} has indexes for:`;
                for (const index of this.indexes) {
                  message += `\n     [${index.attrs.toString()}]`;
                }
            }
        }

        throw this.usageError(message);
    }

    replaceAll(items: ItemType[]) {
        this.deleteAll();
        for (const item of items)
            this.put(item);
    }

    getOneByAttrValue(attr: string, value: any): ItemType {
        const index = this.indexesBySingleAttr.get(attr);
        if (!index)
            throw this.usageError("can't getOneByAttrValue, no index for: " + attr);

        const key: AttrMap = new Map();
        key.set(attr, value);

        return index.getOne(key);
    }

    getOne(where: any): ItemType | null {
        for (const found of this.where(where)) {
            return found as any as ItemType;
        }

        return null;
    }

    hasAttr(attr: string): boolean {
        return !!this.schema.attrs[attr];
    }

    has(where: any): boolean {
        return this.getOne(where) != null;
    }

    list(): ItemType[] {
        return Array.from(this.items.values());
    }

    toMap(byAttr: string) {
        const map = new Map();
        for (const item of this.scan()) {
            map.set(get(item, byAttr), item);
        }
        return map;
    }

    *[Symbol.iterator]() {
        yield* this.scan();
    }

    *scan() {
        for (const item of this.items.values()) {
            yield (item as any as ItemType)
        }
    }

    *scanWhere(where: any) {
        for (const item of this.scan()) {

            let match = true;
            for (const [ attr, expectedValue ] of Object.entries(where)) {
                if (item[attr] !== expectedValue) {
                    match = false;
                    break;
                }
            }

            if (match)
                yield item;
        }
    }

    *column(attr: string) {
        for (const item of this.scan()) {
            yield item[attr];
        }
    }

    columnList(attr: string): any[] {
        return Array.from(this.column(attr));
    }

    columnAsSet(attr: string) {
        const asSet = new Set();
        for (const value of this.column(attr))
            asSet.add(value);
        return asSet;
    }

    one(where?: any): ItemType | null {
        if (!where) {
            for (const item of this.scan())
                return item;
            return null;
        }

        for (const item of this.where(where))
            return item;
        return null;
    }

    listWhere(where: any): ItemType[] {
        return Array.from(this.where(where));
    }

    update(where: any, updater: (item: ItemType) => ItemType, changeInfo?: any) {
        for (const item of this.where(where)) {

            // Remove old value from indexes.
            for (const index of this.indexes) {
                if (index.coversItem(item))
                    index.remove(item);
            }

            updater(item);

            // Add new value to indexes
            for (const index of this.indexes) {
                if (index.coversItem(item))
                    index.insert(item);
            }

            for (const listener of (this.itemChangeListeners || [])) {
                listener({ verb: 'update', item, writer: changeInfo && changeInfo.writer });
            }

            // Send to listener streams
            let anyClosed = false;
            for (const listener of (this.listenerStreams || [])) {
                if (listener.isDone()) {
                    anyClosed = true;
                    continue;
                }
                listener.receive({ t: 'item', item });
            }

            if (anyClosed)
                this.listenerStreams = this.listenerStreams.filter(s => !s.isDone());
        }
    }

    _deleteOne(item: ItemType, changeInfo?: any) {

        const itemHeader = header(item);

        assert(itemHeader, '_deleteOne item has no header');
        assert(itemHeader.tableInternalKey, '_deleteOne item has no tableInternalKey');

        this.items.delete(itemHeader.tableInternalKey);

        // Update indexes
        for (const index of this.indexes) {
            if (index.coversItem(item)) {
                index.remove(item);
            }
        }

        // Update referencers
        if (itemHeader.referencers) {
            const referencers = itemHeader.referencers;
            itemHeader.referencers = null;

            for (const referencer of referencers.values()) {
                const resolution = referencer.onDelete;
                const referencerHeader = header(referencer.value);

                switch (resolution) {
                case 'cascade': {
                    const referencerTable = referencerHeader && referencerHeader.table;
                    if (referencerTable) {
                        referencerTable.delete(referencer.value);
                    }
                    // is it an error if referencerTable is not found?
                    break;
                }
                case 'set_null':
                    referencer.value[referencer.attr] = null;
                    break;
                }
            }
        }

        clearHeader(item);

        if (this.itemChangeListeners) {
            for (const listener of (this.itemChangeListeners || [])) {
                listener({ verb: 'delete', item, writer: changeInfo && changeInfo.writer });
            }
        }

        let anyClosed = false;
        for (const listener of (this.listenerStreams || [])) {
            if (listener.isDone()) {
                anyClosed = true;
                continue;
            }
            listener.receive({ t: 'delete', item });
        }

        if (anyClosed)
            this.listenerStreams = this.listenerStreams.filter(s => !s.isDone());
    }

    delete(where: any, changeInfo?: any) {
        if (ConfigFrequentValidation)
            this.internalValidate();

        for (const found of this.where(where)) {
            this._deleteOne(found, changeInfo);
        }

        if (ConfigFrequentValidation)
            this.internalValidate();
    }

    deleteAll() {
        this.delete(null);
    }

    addChangeListener(listener: ItemChangeListener) {
        this.itemChangeListeners = this.itemChangeListeners || [];
        this.itemChangeListeners.push(listener);
    }

    startListenerStream(step?: Task): Stream {
        const stream = new Stream(this.owner, 'listening to table: ' + this.name);
        stream.receive({ t: 'patch_mode' });
        this.listenerStreams = this.listenerStreams || [];
        this.listenerStreams.push(stream);

        if (step) {
            trackNewListenStream(step, stream);
        }

        return stream;
    }

    startBatchListenerStream(step?: Task): Stream {
        const stream = new Stream(this.owner, 'listening to table: ' + this.name);
        stream.receive({ t: 'patch_mode' });
        this.batchListenerStreams = this.batchListenerStreams || [];
        this.batchListenerStreams.push(stream);

        if (step) {
            trackNewListenStream(step, stream);
        }

        return stream;
    }

    internalValidate() {
        for (const [ tableInternalKey, item ] of this.items.entries()) {
            const itemHeader = header(item);
            if (itemHeader.table !== this) {
                throw new Error("item header .table is wrong: " + JSON.stringify(item));
            }
        }
    }

    usageError(message: string) {
        if (this.name)
            message = `[table ${this.name}] ${message}`;
        return new Error(message);
    }
    
    hasError() {
        return this._errors && this._errors.count() > 0;
    }

    errors(): Table<ErrorItem> {
        return this._errors;
    }

    errorsToException() {
        return newErrorFromItems(this._errors.list());
    }

    throwErrors() {
        if (this.hasError()) {
            throw new ErrorExtended(collectErrorItems(this._errors.list()));
        }
    }

    rebuildIndexes() {
        for (const index of this.indexes)
            index.rebuild();
    }

    query(queryLike: QueryLike, parameters: any = {}, context: QueryExecutionContext = {}): Stream {
        // Create a throwaway Graph for this query.
        const graph = new Graph();
        graph.addTable(this, { readonly: context.readonly });
        return graph.query(queryLike, parameters, context);
    }

    str() {
        return tableSchemaToString(this);
    }

    strs() {
        const out: string[] = [];

        if (this.hasError()) {
            for (const error of this._errors.scan()) {
                out.push('# ' + errorItemToOneLineString(error));
            }
        }

        for (const item of this.scan())
            out.push(formatItem(item));

        return out;
    }

    dump() {
        let out = [];
        out.push(`[${this.name}]`);
        for (const line of formatTable(this)) {
            out.push(line);
        }
        return out.join('\n');
    }
}
