
import { findUniqueAttr } from '../Schema'
import { Table } from '../Table'
import { randomHex } from '../utils/randomHex'
import { TableSchemaIssue } from '../Errors'
import { ItemChangeEvent } from './ItemChangeEvent'
import { Graph } from '../Graph'

interface Params {
    graph: Graph
    source: Table
    delayToSyncMs: number
    onOutgoingData(changes: ItemChangeEvent[]): void
}

export interface DistributedTableConnection {
    clientId: string
    submitNow(): void
    receiveIncomingData(changes: ItemChangeEvent[]): void
}

export function applyChange(table: Table, change: ItemChangeEvent) {

    switch (change.verb) {

    case 'put':
        table.put(change.item, {
            writer: change.writer,
        });
        break;

    case 'delete':
        table.delete(change.item, {
            writer: change.writer,
        });
        break;

    default:
        throw new Error("unrecognized verb: " + change.verb);
    }

}

export function connectDistributedTable(params: Params): DistributedTableConnection {

    const graph = params.graph;
    const sourceTable = params.source;
    const sourceSchema = sourceTable.schema;
    const myClientId = 'client-' + randomHex(8);
    let pendingSendTimer = null;

    const [ uniqueAttr, uniqueAttrConfig ] = findUniqueAttr(sourceSchema);

    if (!uniqueAttr) {
        throw new TableSchemaIssue(sourceTable, "couldn't find a unique attr");
    }

    const syncStatus = graph.newTable({
        attrs: {
            [uniqueAttr]: {
                unique: {
                    onConflict: 'overwrite'
                }
            },
            last_write_by: {},
            // last_write_at: {},
            pending_submit: {},
            deleted: {},
        }
    });

    function maybeQueueSend() {
        if (!pendingSendTimer && params.delayToSyncMs) {
            pendingSendTimer = setTimeout(submit, params.delayToSyncMs);
        }
    }

    function submit() {
        pendingSendTimer = null;
        const out: ItemChangeEvent[] = [];

        for (const syncItem of syncStatus.scanWhere({ pending_submit: true })) {
            syncItem.pending_submit = false;
            
            if (syncItem.deleted) {
                out.push({ verb: 'delete', item: { [uniqueAttr]: syncItem[uniqueAttr] }, writer: myClientId });
            } else {

                const sourceItem = sourceTable.one({ [uniqueAttr]: syncItem[uniqueAttr] });
                if (!sourceItem)
                    throw new Error(`sourceItem not found on ${sourceTable.name} for ${uniqueAttr}=${syncItem[uniqueAttr]}`);

                out.push({ verb: 'put', item: sourceItem, writer: myClientId });
            }
        }
        params.onOutgoingData(out);
    }

    sourceTable.addChangeListener((event) => {
        if (event.writer === myClientId)
            return;

        switch (event.verb) {
        case 'put':
            syncStatus.put({
                [uniqueAttr]: event.item[uniqueAttr],
                last_write_by: myClientId,
                // last_write_at: Date.now(),
                pending_submit: true,
                deleted: false,
            });
            break;

        case 'delete':
            syncStatus.put({
                [uniqueAttr]: event.item[uniqueAttr],
                last_write_by: myClientId,
                // last_write_at: Date.now(),
                pending_submit: true,
                deleted: true,
            });
            break;
        }
    });

    return {
        submitNow: submit,
        clientId: myClientId,
        receiveIncomingData(changes: ItemChangeEvent[]) {
            for (const change of changes) {

                // console.log('receive incoming on ', sourceTable.name(), change);

                applyChange(sourceTable, change);

                syncStatus.put({
                    [uniqueAttr]: change.item[uniqueAttr],
                    last_write_by: change.writer,
                    pending_submit: false,
                });
            }
        }
    }
}
