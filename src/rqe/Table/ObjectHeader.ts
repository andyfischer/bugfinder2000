
import { Table } from '.'
import { OnDeleteOption } from '../Schema'

export interface ObjectHeader {
    table: Table
    tableInternalKey: number
    globalId?: string
    referencers?: Map<string, RowReference>
}

export interface RowReference {
    value: any
    attr: string
    onDelete: OnDeleteOption
}

export function initRowInfo(object: any, rowinfo: ObjectHeader) {
    // by using defineProperty, this 'secret' property won't show up in Object.keys() or JSON.stringify()
    Object.defineProperty(object, 'rowinfo', { value: 'static', writable: true });
    object.rowinfo = rowinfo;
}

export function withoutHeader(object: any) {
    return {
        ...object,
    }
}

export function clearHeader(object: any) {
    object.rowinfo = {} as any;
}

export function header(object: any): ObjectHeader {
    return object.rowinfo;
}

export function itemGlobalId(header: ObjectHeader) {
    if (header.globalId)
        return header.globalId;

    const globalId = header.table.name + '/' + header.tableInternalKey;
    header.globalId = globalId;
    return globalId;
}
