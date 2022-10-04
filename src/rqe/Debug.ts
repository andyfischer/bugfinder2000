
import { Graph } from './Graph'
import { MountPointSpec } from './MountPoint'
import { Table } from './Table'
import { formatTable } from './format/TableFormatter'
import { taggedToString } from './TaggedValue'
import { EnableWarningOnUnserializableData } from './config'
import { queryTagToString } from './QueryTuple'
import { c_done } from './Enums'
import { Stream, StreamEvent } from './Stream'
import { formatItem } from './format/formatItem'

declare global {
    interface Console {
      slog: typeof console.log
    }
}

console.slog = structuredConsoleLog;

export function graphToString(graph: Graph, options: { reproducible?: boolean } = {}) {
    const out: string[] = [];

    if (graph.graphId && !options.reproducible)
        out.push(`Graph ${graph.graphId || ''}:`);
    else
        out.push(`Graph:`);

    for (const module of graph.modules) {
        for (const point of module.points) {
            let str = '';

            if (point.name)
                str += `[${point.name}]`;

            str += '  ' + mountPointToString(point);

            out.push(str);
        }
    }

    return out.join('\n');
}

export function graphTablesToString(graph: Graph, options: { reproducible?: boolean } = {}) {
    const out: string[] = [];

    if (graph.graphId && !options.reproducible)
        out.push(`Graph ${graph.graphId || ''} contents:`);
    else
        out.push(`Graph contents:`);

    for (const table of graph.tables.values()) {
        out.push(`  [${table.name}]`);
        for (const line of formatTable(table)) {
            out.push('  ' + line);
        }
    }

    return out.join('\n');
}


export function tableSchemaToString(table: Table) {
    let out: string[] = [];

    if (table.name)
        out.push(`Table ${table.name}:`);
    else
        out.push(`Table:`);

    for (const index of table.indexes) {
        out.push(`  index: (${index.attrs.join(' ')})`);
    }

    return out.join('\n');
}

export function mountPointToString(spec: MountPointSpec) {
    let requiredAttrs = [];
    let outputAttrs = [];

    for (const [attr, config] of Object.entries(spec.attrs)) {
        if (config.required)
            requiredAttrs.push(attr);
        else
            outputAttrs.push(attr);
    }

    let out = '';

    if (requiredAttrs.length > 0)
        out += `${requiredAttrs.join(' ')} `;

    if (outputAttrs.length > 0) 
        out += `-> ${outputAttrs.join(' ')}`

    return out;
}

export function valueToString(value: any) {
    if (!value)
        return JSON.stringify(value);

    switch (value.t) {
    case 'query':
    case 'queryStep':
        return `(${value.toQueryString()})`;
        return `(${value.toQueryString()})`;
    }

    return JSON.stringify(value);
}

export function toStructuredString(arg: any): String {
    if (!arg)
        return arg + '';

    // handle types that are not TaggedValue types.
    switch (arg.t) {
    case 'stream':
        return `Stream(id=${arg.id})`;
    case 'no_value':
        return '<no_value>';
    case 'some_value':
        return '<some_value>';
    case 'expected_value':
        return `expected_value(${arg.value.toQueryString()})`;
    case 'expected_union':
        return `expected_union([${arg.values.map(formatItem).join(', ')}])`;
    case 'tag':
        return queryTagToString(arg);
    }

    if (Array.isArray(arg)) 
        return '[' + arg.map(toStructuredString).join(', ') + ']';

    if (arg.t)
        return taggedToString(arg);

    if (arg == null)
        return arg + '';

    if (typeof arg === 'object') {
        const pairs = [];

        for (const [ key, value ] of Object.entries(arg)) {
            pairs.push(`${key}: ${toStructuredString(value)}`);
        }

        return `{${pairs.join(', ')}}`;
    }

    return arg + '';
}

export function structuredConsoleLog(...args: any[]) {
    const out = args.map(toStructuredString);

    console.log.apply(null, out);
}

export function assertDataIsSerializable(data: any, depth?: number) {
    if (depth > 5) {
        return;
    }

    if (EnableWarningOnUnserializableData) {

        // First check some known common types.
        if (data?.t === 'stream')
            throw new Error(`can't serialize type: Stream`);

        // At the moment the important one to catch is Function because it will be silently ignored
        // by JSON.stringify.
        //
        // Other types that are silently ignored by JSON.stringify are Undefined (which is fine) and
        // Symbol (not used by us)
        //
        // There are other possible serialization errors (like cyclic references) but these throw an
        // exception in JSON.stringify, so there's your assertion, buddy.

        if (typeof data === 'function') {
            const err = new Error("can't serialize type: function");
            err['badType'] = 'function'
            err['path'] = [];
            throw err;
        }

        if (typeof data === 'object') {
            for (const [k,v] of Object.entries(data)) {
                try {
                    assertDataIsSerializable(v, depth + 1);
                } catch (err) {
                    if (err['badType']) {
                        err['path'] = [k].concat(err['path']);
                        err.message = `can't serialize type: ${err['badType']} (at path: ${err['path'].join('.')})`;
                        throw err;
                    }
                }
            }
        }
    }
}

export class StreamProtocolValidator {
    description: string
    hasSentDone: boolean = false

    constructor(description: string) {
        this.description = description;
    }

    check(msg: StreamEvent) {
        if (this.hasSentDone) {
            const error = `Stream validation failed for (${this.description}), sent message after done: ${JSON.stringify(msg)}`;
            console.error(error);
            throw new Error(error);
        }

        if (msg.t === c_done) {
            this.hasSentDone = true;
        }
    }
}

export function wrapStreamInValidator(description: string, after: Stream): Stream {
    const before = new Stream();
    const validator = new StreamProtocolValidator(description);

    before.sendTo({
        receive(msg) {
            validator.check(msg);
            after.receive(msg);
        }
    });

    return before;
}
