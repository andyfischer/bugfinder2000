
import { Table } from '../Table'
import { TableSchema } from '../Schema'
import { ItemChangeEvent } from './ItemChangeEvent'
import { MountPoint } from '../MountPoint'

export function applyChange(change: ItemChangeEvent, table: Table, changeInfo?: any) {
    switch (change.verb) {

    case 'put':
        table.put(change.item, changeInfo);
        break;

    case 'delete':
        table.delete(change.item, changeInfo);
        break;
    }
}

export function applyChangeToMountedTable(change: ItemChangeEvent, table: MountPoint, changeInfo?: any) {

    /* TODO
    switch (change.verb) {

    case 'put':
        table.put().callWithItem(change.item, changeInfo);
        break;

    case 'delete':
        table.delete().callWithItem(change.item, changeInfo);
        break;
    }
    */
}

export function applyChangeList(changes: ItemChangeEvent[], table: Table) {
    for (const change of changes) {
        applyChange(change, table);
    }
}

export function findUniqueAttr(schema: TableSchema) {
    for (const [attr, attrConfig] of Object.entries(schema.attrs)) {
        if (attrConfig.unique)
            return attr;
    }

    return null;
}

/*
export function collapseChangeList(changes: ItemModifiedEvent[], table: Table): ItemModifiedEvent[] {

    const uniqueAttr = findUniqueAttr(table.schema());
    if (!uniqueAttr)
        return changes;

    const mostRecentChange = new Map();
    for (const change of changes) {
        const key = change.item[uniqueAttr];
        if (!key)
            console.error('collapseChangeList internal error: item has no value for ', uniqueAttr);

        mostRecentChange.set(key, change);
    }

    return Array.from(mostRecentChange.values());
}
*/
