
import consolePrintTable from './consolePrintTable'
import { attrs } from '../Item'
import { formatItem } from './formatItem'
import { Table } from '../Table'

function isMultiColumn(rel: Table) {

    const columns = new Map();

    for (const item of rel.scan()) {
        for (const attr of attrs(item)) {

            columns.set(attr, true)

            if (columns.size > 1)
                return true;
        }
    }

    return false;
}

export function consoleFormatRelation(rel: Table): string[] {

    if (rel.hasError()) {
        return consoleFormatError(rel);
    }

    const out = [];

    if (rel.hasError())
        for (const error of rel.errors().list())
            out.push(`#error ${error.errorType} ${error.message || ''}`);

    if (isMultiColumn(rel)) {
        for (const line of consolePrintTable(rel)) {
            out.push('  ' + line);
        }
    } else {
        for (const item of rel.scan()) {
            out.push('  ' + formatItem(item));
        }
    }
    return out;
}

export function consoleFormatError(rel: Table) {
    return rel.errors().list().map(error => `Error: ${error.message}`)
}
