
import { TaggedValue, toTagged, unwrapTagged, taggedToString } from './TaggedValue'
import { Item } from './Item'
import { QueryParameters, QueryModifier } from './Query'
import { Graph } from './Graph'
import { javascriptQuickMountIntoGraph } from './QuickMount'
import { parseQueryTupleOrError } from './parser/parseQueryTuple'
import { toPlainData, tvalEquals } from './TaggedValue'
import { has } from './Item'
import { ErrorItem } from './Errors'
import { maybeArray } from './utils/arrayUtil'

export type QueryStepLike = QueryTuple | LooseQueryVerbStep | Function | string;

export interface QueryTag {
    t: 'tag'
    attr: string
    value: TaggedValue
    identifier?: string
    specialAttr?: { t: 'star' }

    // when executing a query - a tag marked isOptional may be dropped if necessary
    // to find a match.
    isOptional?: true

    isFlag?: true
}

export interface QueryTuplePlainData {
    t: 'queryTuplePlain'
    tags: QueryTag[]
}

interface QueryPrepareContext {
    graph?: Graph
    expectTransform?: boolean
}

export interface LooseQueryVerbStep {
    // verb?: string
    attrs: { [key: string]: any }
}

function tagsEqual(lhs: QueryTag, rhs: QueryTag) {
    return ((lhs.t === rhs.t)
            && (lhs.attr === rhs.attr)
            && (tvalEquals(lhs.value, rhs.value))
            && (lhs.identifier === rhs.identifier)
            && (lhs.isOptional === rhs.isOptional));
}

export class QueryTuple {
    t: 'queryTuple' = 'queryTuple'
    tags: QueryTag[]
    
    // derived:
    byAttr: Map<string, number>

    constructor(tags: QueryTag[]) {
        this.tags = tags;
        this.rebuildByAttrMap();
    }

    rebuildByAttrMap() {
        this.byAttr = new Map();

        for (let i = 0; i < this.tags.length; i++) {
            const tag = this.tags[i];
            if (this.byAttr.has(tag.attr))
                throw new Error("duplicate attr: " + tag.attr);
            this.byAttr.set(tag.attr, i);
        }
    }

    getAttr(attr: string) {
        const found = this.byAttr.get(attr);
        if (found === undefined)
            return null;
        return this.tags[found];
    }

    getStringValue(attr: string) {
        const tag = this.getAttr(attr);
        if (tag.value.t === 'str_value')
            return tag.value.str;
        throw new Error("not a string: " + attr);
    }

    has(attr: string) {
        return this.byAttr.has(attr);
    }

    hasValue(attr: string) {
        const tag = this.getAttr(attr);
        return tag && tag.value.t !== 'no_value';
    }

    hasStar() {
        for (const tag of this.tags)
            if (tag.specialAttr && tag.specialAttr.t === 'star')
                return true;
        return false;
    }

    shallowCopy() {
        return new QueryTuple(this.tags.concat());
    }

    withoutStar() {
        return new QueryTuple(this.tags.filter(tag => tag.specialAttr && tag.specialAttr.t === 'star'));
    }

    withoutFirstTag() {
        return new QueryTuple(this.tags.slice(1));
    }

    addTag(tag: QueryTag) {
        if (this.byAttr.has(tag.attr))
            throw new Error("duplicate attr: " + tag.attr);
        this.byAttr.set(tag.attr, this.tags.length);
        this.tags.push(tag);
    }

    addTag2(attr: string, value?: TaggedValue | any) {
        if (this.byAttr.has(attr))
            throw new Error("duplicate attr: " + attr);

        value = toTagged(value);

        this.addTag({ t: 'tag', attr, value });
    }

    addTags(tags: QueryTag[]) {
        for (const tag of tags)
            this.addTag(tag);
    }

    addAttr(attr: string) {
        if (this.byAttr.has(attr))
            throw new Error("duplicate attr: " + attr);
        this.tags.push({ t: 'tag', attr, value: { t: 'no_value' }});
        this.byAttr.set(attr, this.tags.length - 1);
    }

    addParam(attr: string) {
        if (this.byAttr.has(attr))
            throw new Error("duplicate attr: " + attr);
        this.tags.push({ t: 'tag', attr, identifier: attr, value: { t: 'no_value' }});
        this.byAttr.set(attr, this.tags.length - 1);
    }

    convertToParam(attr: string) {
        if (this.byAttr.has(attr))
            this.overwriteTag({ ...this.getAttr(attr), identifier: attr });
        else
            this.addParam(attr);
    }

    addAttrIfNeeded(attr: string) {
        if (this.byAttr.has(attr))
            return;

        this.addAttr(attr);
    }

    addAttrs(attrs: string[]) {
        for (const attr of attrs)
            this.addAttr(attr);
    }

    addAttrsIfNeeded(attrs: string[]) {
        for (const attr of attrs)
            this.addAttrIfNeeded(attr);
    }

    remapTags(callback: (tag: QueryTag) => QueryTag): QueryTuple {
        const newTags = [];
        for (const tag of this.tags) {
            const newTag = callback(tag)
            if (newTag)
                newTags.push(newTag);
        }
        return new QueryTuple(newTags);
    }

    overwriteTag(tag: QueryTag) {
        if (!this.byAttr.has(tag.attr))
            throw new Error("can't overwrite, tag not present: " + tag.attr);
        this.tags[this.byAttr.get(tag.attr)] = tag;
    }

    addOrOverwriteTag(tag: QueryTag) {
        if (this.byAttr.has(tag.attr))
            this.overwriteTag(tag);
        else
            this.addTag(tag);
    }

    deleteAttr(attr: string) {
        const found = this.byAttr.get(attr);
        if (found === undefined)
            return;

        this.tags = this.tags.slice(0, found).concat(this.tags.slice(found + 1));
        this.rebuildByAttrMap();
    }

    toItemValue() {
        const item: Item = {};
        for (const tag of this.tags) {
            if (tag.value.t === 'abstract') {
                item[tag.attr] = null;
                continue;
            }
            item[tag.attr] = unwrapTagged(tag.value);
        }

        return item;
    }

    toDefaultIncludeValues() {
        // Returns values that should be "default included" in the result of a query using
        // this tuple. When doing a query, the code should get the raw values (maybe from
        // a mount point) and then augment them with these values.

        const item: Item = {};
        for (const tag of this.tags) {
            if (tag.value.t === 'abstract')
                continue;
            item[tag.attr] = unwrapTagged(tag.value);
        }

        return item;
    }

    injectParameters(parameters: QueryParameters): QueryTuple {
        return this.remapTags(tag => {
            if (tag.value.t === 'queryTuple') {
                return {
                    ...tag,
                    value: tag.value.injectParameters(parameters),
                }
            }

            if (tag.value.t === 'query') {
                const nestedQuery = tag.value;

                return {
                    ...tag,
                    value: tag.value.injectParameters(parameters),
                }
            }

            if (tag.identifier && parameters[tag.identifier] !== undefined) {
                return {
                    ...tag,
                    identifier: null,
                    value: toTagged(parameters[tag.identifier]),
                }
            }

            return tag;
        });
    }

    getRelated(modifier: QueryModifier) {
        const out = this.shallowCopy();
        if (modifier.with)
            for (const attr of maybeArray(modifier.with))
                out.addOrOverwriteTag({ t: 'tag', attr, value: { t: 'no_value' } });

        if (modifier.without)
            for (const attr of maybeArray(modifier.without))
                out.deleteAttr(attr);
        return out;
    }

    getErrorOnUnfilledParameters(): ErrorItem | null {
        for (const tag of this.tags) {
            if (tag.identifier)
                return { errorType: 'missing_parameter', data: [{ missingParameterFor: tag.identifier }] }
        }
    }

    errorOnUnfilledParameters() {
        for (const tag of this.tags) {
            if (tag.identifier)
                throw new Error(`Missing parameter for $${tag.identifier}`);
        }
    }

    checkFilledParameters(params: QueryParameters) {
        for (const tag of this.tags) {
            if (tag.identifier && !has(params, tag.attr))
                throw new Error(`Missing parameter for $${tag.identifier}`);
        }
    }

    convertToPut() {
        const query = this.shallowCopy();
        query.addTag({ t: 'tag', attr: 'put!', value: { t: 'no_value' }});
        return query;
    }

    static fromItem(item: Item) {
        const tags: QueryTag[] = [];
        for (const [attr, value] of Object.entries(item)) {
            tags.push({
                t: 'tag',
                attr,
                value: (value == null) ? { t: 'no_value' } : toTagged(value)
            });
        }
        return new QueryTuple(tags);
    }

    toPlainData(): QueryTuplePlainData {
        return {
            t: 'queryTuplePlain',
            tags: this.tags.map(tag => ({
                ...tag,
                value: toPlainData(tag.value),
            }))
        }
    }

    equals(rhs: QueryTuple) {
        if ((this.t !== rhs.t)
            || (this.tags.length !== rhs.tags.length))
            return false;

        for (let i=0; i < this.tags.length; i++)
            if (!tagsEqual(this.tags[i], rhs.tags[i]))
                return false;

        return true;
    }

    static fromObject(object: QueryTuplePlainData) {
        return new QueryTuple(object.tags);
    }

    toQueryString() {
        return queryTupleToString(this);
    }
}

export function queryTupleToString(tuple: QueryTuple) {
    const out = [];

    for (const tag of tuple.tags) {
        out.push(queryTagToString(tag));
    }

    return out.join(' ');
}

export function queryTagToString(tag: QueryTag) {
    let attr = tag.attr;

    if (attr === '*')
        return '*';

    let out = '';

    if (tag.isFlag)
        out += '--'

    if (tag.identifier) {
        if (tag.identifier === attr)
            out += '$'
        else
            out += `[$${tag.identifier}] `
    }

    out += attr;

    if (tag.isOptional)
        out += '?';

    if (tag.value.t !== 'no_value') {
        out += `=`;
        out += taggedToString(tag.value);
    }

    return out;
}

export function toQueryTuple(step: QueryStepLike, ctx: QueryPrepareContext = {}): QueryTuple {

    if ((step as QueryTuple).t === 'queryTuple')
        return step as QueryTuple;

    if (typeof step === 'function') {
        if (!ctx.graph)
            throw new Error("Can't prepare a mounted function without a graph");

        const mount = javascriptQuickMountIntoGraph(ctx.graph, step);

        const tags: QueryTag[] = [
            { t: 'tag', attr: 'join', value: { t: 'no_value' }}
        ];

        for (const [ attrName, attrConfig ] of Object.entries(mount.attrs)) {
            tags.push({ t: 'tag', attr: attrName, value: { t: 'no_value' }});
        }

        return new QueryTuple(tags);
    }

    if (typeof step === 'string') {
        const parsed = parseQueryTupleOrError(step /*, { expectVerb: true }*/);
        if (parsed.t === 'parseError')
            throw new Error("parse error: " + parsed.message);
        return parsed as QueryTuple;
    }

    const looseStep = step as LooseQueryVerbStep;

    if (looseStep.attrs)
        return QueryTuple.fromItem(looseStep.attrs);

    throw new Error("step is missing .attrs");
}
