
import { Table } from '../Table'
import { applyChangeList } from './changePropogation'
import { connectDistributedTable } from './distributedTable'
import { Graph } from '../Graph'

export function newDebouncedTable(graph: Graph, table: Table, delayMs: number = 0) {

    const baseSchema = table.schema;

    const schema = {
        ...baseSchema,
        name: baseSchema.name + '/debounce'
    }

    const debounced = graph.newTable(schema);

    connectDistributedTable({
        graph,
        source: table,
        delayToSyncMs: delayMs,
        onOutgoingData(changes) {
            applyChangeList(changes, debounced);
        }
    });

    return debounced;
}
