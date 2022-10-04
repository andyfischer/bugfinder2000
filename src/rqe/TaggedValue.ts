
import { Query, QueryPlainData } from './Query'
import { QueryTuple, QueryTuplePlainData, queryTupleToString } from './QueryTuple'
import { Item } from './Item'
import { formatItem } from './format/formatItem'
import { pointSpecToDeclString, MountPointSpec } from './MountPoint'
import { TaggedValueErrorOnUnknownTag } from './config'
import { assertDataIsSerializable } from './Debug'

export interface StringValue {
    t: 'str_value'
    str: string
}

export interface BoolValue {
    t: 'bool_value'
    val: boolean
}

export interface ObjectValue {
    t: 'obj_value'
    val: any
}

export interface NoValue {
    t: 'no_value'
}

export interface ItemValue {
    t: 'item'
    item: Item
}

export interface AbstractValue {
    t: 'abstract'
}

export type TaggedValue = StringValue | ItemValue | BoolValue 
    | NoValue | AbstractValue
    | ObjectValue | QueryTuple | Query | MountPointSpec | QueryPlainData | QueryTuplePlainData

export function toTagged(val: any): TaggedValue {
    if (val == null) {
        return {
            t: 'no_value',
        }
    }

    // Return the original object when it's already tagged.
    switch (val.t) {
    case 'query':
    case 'queryTuple':
    case 'str_value':
    case 'obj_value':
    case 'no_value':
    case 'item':
    case 'tag':
        return val;
    }

    if (val.t) 
        throw new Error("toTagged called on value with unrecognized 't': " + val.t);

    switch (typeof val) {
    case 'string':
        return {
            t: 'str_value',
            str: val,
        }
    case 'number':
        return {
            t: 'str_value',
            str: val + '',
        }
    case 'boolean':
        return {
            t: 'bool_value',
            val: val
        }
    }

    return {
        t: 'obj_value',
        val,
    }

    throw new Error("unsupported type in toTagged: " + val);
}

export function unwrapTagged(tval: TaggedValue) {
    switch (tval.t) {
    case 'str_value':
        return tval.str;
    case 'no_value':
        return null;
    case 'query':
    case 'queryTuple':
        return tval;
    case 'item':
        return tval.item;
    case 'obj_value':
        return tval.val;
    case 'abstract':
        throw new Error(`can't unwrap an abstract value`);
    default:
        throw new Error('unhandled case in unwrapTagged: ' + (tval as any).t);
    }
}

export function wrapItem(item: Item) {
    return { t: 'item', item };
}

export function taggedToString(tval: TaggedValue) {
    switch (tval.t) {
    case 'str_value':
        return tval.str;
    case 'no_value':
        return '<no_value>';
    case 'query':
        return '(' + tval.toQueryString() + ')';
    case 'queryTuple': {
        return queryTupleToString(tval);
    }
    case 'item':
        return formatItem(tval.item);
    case 'obj_value':
        try {
            return JSON.stringify(tval.val);
        } catch (err) {
            return `{ /* can't JSON stringify */ }`
        }
    case 'mountPointSpec':
        return pointSpecToDeclString(tval);
    case 'abstract':
        return '<abstract>';
    default:
        if (TaggedValueErrorOnUnknownTag)
            throw new Error('unknown type in taggedToString: ' + (tval as any).t);

        return JSON.stringify(tval);
    }
}

export function taggedFromObject(object: any) {
    switch (object.t) {
    case 'queryPlain':
        return Query.fromObject(object);
    case 'queryTuplePlain':
        return QueryTuple.fromObject(object);
    case 'query':
        throw new Error("can't fromObject a value with t=query");
    case 'queryTuple':
        throw new Error("can't fromObject a value with t=queryTuple");
    }

    return object;
}

export function tvalEquals(left: TaggedValue, right: TaggedValue) {
    if (left.t !== right.t)
        return false;

    switch (left.t) {
    case 'item':
    case 'queryTuple':
    case 'obj_value':
        console.warn('warning- tvalEquals not fully implemented for objects');
    }

    return unwrapTagged(left) === unwrapTagged(right);
}

export function toPlainData(val: any) {
    if (val?.t) {
        switch (val.t) {
        case 'query':
        case 'queryTuple':
            return val.toPlainData();
        }
    }

    assertDataIsSerializable(val);

    return val;
}

export function toPlainDataDeep(val: any, recursionLevel = 0) {
    if (recursionLevel > 100)
        throw new Error("toPlainDataDeep: max recursion limit reached");

    if (!val)
        return val;

    if (val?.t) {
        switch (val.t) {
        case 'stream':
            throw new Error(`can't call toPlainDataDeep on a Stream`);
        case 'query':
        case 'queryTuple':
            return val.toPlainData();
        }
    }

    if (Array.isArray(val))
        return val.map(item => toPlainDataDeep(item, recursionLevel + 1));

    if (typeof val === 'object') {
        const updated = {};
        for (const [key,value] of Object.entries(val))
            updated[key] = toPlainDataDeep(value, recursionLevel+1);
        return updated;
    }

    return val;
}
