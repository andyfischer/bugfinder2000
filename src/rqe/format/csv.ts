
import { Table } from '../Table'

interface Options {
    attrs?: string[]
    includeHeader?: boolean
}

function maybeQuote(s: string) {
    if (s == null)
        return '';

    if (typeof s !== 'string') {
        s = s + '';
    }

    const needsQuote = s.includes(',') || s.includes('\r') || s.includes('\n') || s.includes('"');

    if (needsQuote) {
        return `"${s.replace(/"/g, '""')}"`
    } else {
        return s;
    }
}

export function* formatAsCsv(table: Table, opts: Options = {}): IterableIterator<string> {

    let attrs = opts.attrs;
    let seperator = '\t'
    const includeHeader = (opts.includeHeader !== undefined) ? opts.includeHeader : true;

    if (!attrs) {
        attrs = Object.keys(table.schema.attrs);
    }

    if (includeHeader) {
        let first = true;
        for (const attr of attrs) {
            if (!first)
                yield seperator;
            yield maybeQuote(attr);
            first = false;
        }
        yield '\n'
    }

    for (const item of table.list()) {
        let first = true;
        for (const attr of attrs) {
            if (!first)
                yield seperator;
            let value = item[attr];
            if (value == null)
                value = ''
                
            yield maybeQuote(value);
            first = false;
        }
        yield '\n'
    }
}
