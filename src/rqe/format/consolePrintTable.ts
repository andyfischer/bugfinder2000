
import { has, get, attrs } from '../Item'
import { Table } from '../Table'
import { formatValue } from './formatItem'

class LazyMap<K,V> {
    m = new Map<K,V>()
    loader: (key: K) => V

    constructor(loader) {
        this.loader = loader;
    }

    get(key: K): V {
        if (!this.m.has(key)) {
            const val = this.loader(key);
            this.m.set(key, val);
            return val;
        }

        return this.m.get(key);
    }

    values() {
        return this.m.values();
    }
}

class Column {
    title: string
    items: string[] = []
    width = 0

    outputStrings: string[] = []

    constructor(title: string) {
        this.title = title;
    }

    formatCell(v: any) {
        const s: string = formatValue(v);
        return rightPadSpaces(s, this.width);
    }
}

function rightPadSpaces(s: string, size: number) {
    if (s.length > size)
        throw new Error(`internal error, string '${s}' is bigger than size ${size}`);

    let spaceRight = size - s.length;
    return s + ' '.repeat(spaceRight);
}

function centerPadSpaces(s: string, size: number) {
    if (s.length > size)
        throw new Error(`internal error, string '${s}' is bigger than size ${size}`);

    let spaceLeft = Math.floor((size - s.length) / 2);
    let spaceRight = Math.ceil((size - s.length) / 2);

    return ' '.repeat(spaceLeft) + s + ' '.repeat(spaceRight);
}

// see https://en.wikipedia.org/wiki/Box-drawing_character
//const horizLineChar = '\u2500'
//const vertLineChar = '\u2502'
//const crossLineChar = '\u253c'

const horizLineChar = '\u2501'
const vertLineChar = '\u2503'
const crossLineChar = '\u254b'

export default function printAsTable(rel: Table): string[] {

    const columns = new LazyMap<string,Column>(title => new Column(title));
    const outputLines = [];

    // Figure out all the columns.
    for (const item of rel.scan()) {
        for (const attr of attrs(item)) {
            const column: Column = columns.get(attr);
            const value = get(item, attr);
            const str = formatValue(value);
            column.items.push(str);
        }
    }

    // Find max width for each column
    for (const column of columns.values()) {

        column.width = Math.max(column.width, column.title.length);

        for (const item of column.items) {
            let length = (item && item.length) || 0;
            if (!isFinite(length))
                length = 0;
            column.width = Math.max(column.width, length);
        }
    }

    // Format output of title bar
    const titleEls = [];
    const titleBarEls = [];
    for (const column of columns.values()) {
        titleEls.push(column.formatCell(column.title));
        titleBarEls.push(horizLineChar.repeat(column.width));
    }

    outputLines.push(titleEls.join(` ${vertLineChar} `));
    outputLines.push(titleBarEls.join(`${horizLineChar}${crossLineChar}${horizLineChar}`));

    // Format every row
    for (const item of rel.scan()) {
        const outputEls = [];
        for (const column of columns.values()) {
            const value = has(item, column.title) ? (get(item, column.title)) : '';
            outputEls.push(column.formatCell(value));
        }
        outputLines.push(outputEls.join(` ${vertLineChar} `));
    }

    return outputLines;
}

export function printItemsAsTable(items: any[]): string[] {

    const columns = new LazyMap<string,Column>(title => new Column(title));
    const outputLines = [];

    // Figure out all the columns.
    for (const item of items) {
        for (const attr of attrs(item)) {
            const column: Column = columns.get(attr);
            const value = get(item, attr);
            const str = formatValue(value);
            column.items.push(str);
        }
    }

    // Find max width for each column
    for (const column of columns.values()) {

        column.width = Math.max(column.width, column.title.length);

        for (const item of column.items) {
            let length = (item && item.length) || 0;
            if (!isFinite(length))
                length = 0;
            column.width = Math.max(column.width, length);
        }
    }

    // Format output of title bar
    const titleEls = [];
    const titleBarEls = [];
    for (const column of columns.values()) {
        titleEls.push(column.formatCell(column.title));
        titleBarEls.push(horizLineChar.repeat(column.width));
    }

    outputLines.push(titleEls.join(` ${vertLineChar} `));
    outputLines.push(titleBarEls.join(`${horizLineChar}${crossLineChar}${horizLineChar}`));

    // Format every row
    for (const item of items) {
        const outputEls = [];
        for (const column of columns.values()) {
            const value = has(item, column.title) ? (get(item, column.title)) : '';
            outputEls.push(column.formatCell(value));
        }
        outputLines.push(outputEls.join(` ${vertLineChar} `));
    }

    return outputLines;
}
