
import { AttrSchema } from '../Stream'
import { TaggedValue } from '../TaggedValue'

export function formatValue(value: any, schema?: AttrSchema) {

    if (schema && schema.type === 'TableAttrsList') {
        let out = [];
        for (const [ attr, details ] of Object.entries(value)) {
            let s = attr;
            if ((details as any).required === false)
                s += '?';
            out.push(s);
        }
        return out.join(' ');
    }

    if (value == null)
        return '';

    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
        return value.toString('hex');

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (err) {
            return `{ /* error during JSON stringify */ }`
        }
    }

    return value + '';
}

export function formatValueQuoted(value: any, schema?: AttrSchema) {

    if (value == null)
        return '';

    let str = formatValue(value, schema);

    let needsQuotes = false;
    for (let i=0; i < str.length; i++) {
        if (str[i] === ' ') {
            needsQuotes = true;
            break;
        }
    }

    if (needsQuotes)
        str = '"' + str + '"';

    return str;
}

function formatItemAttr(attr: string, value: any) {
    if (value === null || value === undefined)
        return attr;

    switch ((value as TaggedValue).t) {
    case 'no_value':
        return attr;

    case 'query':
        return `${attr}=(${value.toQueryString()})`;
    }

    return `${attr}=${formatValueQuoted(value)}`;
}

export function formatItem(item: any) {
    const strs: string[] = []

    for (const [ attr, value ] of Object.entries(item)) {
        strs.push(formatItemAttr(attr, value));
    }

    return strs.join(' ');
}
