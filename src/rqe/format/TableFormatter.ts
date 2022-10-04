
import { Item, entries } from '../Item'
import { Table } from '../Table'
import { formatValue } from './formatItem'

const horizLineChar = '\u2501'
const vertLineChar = '\u2503'
const crossLineChar = '\u254b'

export interface TableFormatState {
    schema?: Item
    attrs: Map<string, {
        width: number
        highestObservedWidth: number
    }>
    options?: CustomFormatOptions
}

export interface CustomFormatOptions {
    transformItemsBeforeFormat?(item: Item): Item
}

interface FormattedItem {
    lineCount: number
    cells: Map<string,string[]>
}

export function formatItems(state: TableFormatState, items: Iterable<Item>): FormattedItem[] {

    const result: FormattedItem[] = [];

    for (let item of items) {

        if (state.options?.transformItemsBeforeFormat)
            item = state.options.transformItemsBeforeFormat(item);
        
        let rowLineCount = 1;
        const cells = new Map<string,string[]>();

        for (const [ attr, value ] of entries(item)) {
            // console.log('to string' ,value, formatValue(value))
            let cellLineCount = 1;

            const cellStr = formatValue(value, state.schema && state.schema[attr]);

            const lines = cellStr.split('\n');
            cells.set(attr, lines);
            if (lines.length > rowLineCount)
                rowLineCount = lines.length;
        }

        result.push({ cells, lineCount: rowLineCount });
    }

    return result;
}

export function newTableFormatState(): TableFormatState {
    return {
        attrs: new Map()
    }
}

export function updateStateForItems(state: TableFormatState, items: FormattedItem[]) {

    // Add any new attrs and update highestObservedWidth.

    for (const item of items) {
        for (let [ attr, lines ] of item.cells.entries()) {
            attr = attr || '';

            let width = attr.length;

            for (const line of lines)
                if (line.length > width)
                    width = line.length;

            if (!state.attrs.has(attr)) {
                state.attrs.set(attr, {
                    width,
                    highestObservedWidth: width
                });
            } else {
                const attrData = state.attrs.get(attr);
                if (width > attrData.highestObservedWidth) {
                    attrData.width = width;
                    attrData.highestObservedWidth = width;
                }
            }
        }
    }

    // TODO: Rebalance if we're above the width limit.
}

function rightPadSpaces(s: string, size: number) {
    s = s || '';
    if (s.length > size)
        throw new Error(`internal error, string '${s}' is bigger than size ${size}`);

    let spaceRight = size - s.length;
    return s + ' '.repeat(spaceRight);
}

export function formatHeader(state: TableFormatState) {

    const titleEls = [];
    const titleBarEls = [];

    for (const [ attr, details ] of state.attrs.entries()) {
        const width = details.width;

        const title = rightPadSpaces(attr, width);
        titleEls.push(title);
        titleBarEls.push(horizLineChar.repeat(width));
    }

    const header = titleEls.join(` ${vertLineChar} `);

    return {
        key: header,
        print(log) {
            if (titleEls.length > 0) {
                log(header);
                log(titleBarEls.join(`${horizLineChar}${crossLineChar}${horizLineChar}`));
            }
        }
    }
}

export function printItems(state: TableFormatState, items: FormattedItem[], log: (s: string) => void) {
    for (let item of items) {

        for (let lineIndex=0; lineIndex < item.lineCount; lineIndex++) {
            const outputEls = [];

            for (const [ attr, details ] of state.attrs.entries()) {
                const lines = item.cells.get(attr) || [];
                const thisLine = lines[lineIndex] || '';
                outputEls.push(rightPadSpaces(thisLine, details.width));
            }
            log(outputEls.join(` ${vertLineChar} `));
        }
    }
}

export function formatTable(table: Table): string[] {
    let out = [];

    const formatState = newTableFormatState();
    const formatted = formatItems(formatState, table.scan());
    updateStateForItems(formatState, formatted);
    const header = formatHeader(formatState);
    header.print(s => out.push(s));
    printItems(formatState, formatted, s => out.push(s));
    return out;
}
