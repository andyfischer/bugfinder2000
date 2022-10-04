
import { Table } from '../Table'
import { QueryLike, toQuery } from '../Query'
import { applyTransform } from '../Transform'
import { Graph } from '../Graph'
import { c_item } from '../Enums'

export function linkProjectedRows(graph: Graph, fromTable: Table, queryLike: QueryLike, toTable: Table) {

    const query = toQuery(queryLike, { graph, expectTransform: true });

    applyTransform(graph, fromTable.list(), query)
    .sendTo({
        receive(msg) {
            switch (msg.t) {
            case c_item:
                toTable.put(msg.item);
            }
        }
    });

    fromTable.addChangeListener(evt => {
        if (evt.verb === 'put') {
            applyTransform(graph, [evt.item], query)
            .sendTo({
                receive(msg) {
                    switch (msg.t) {
                    case c_item:
                        toTable.put(msg.item);
                    }
                }
            });
        } else if (evt.verb === 'delete') {
            applyTransform(graph, [evt.item], query)
            .sendTo({
                receive(msg) {
                    switch (msg.t) {
                    case c_item:
                        toTable.delete(msg.item);
                    }
                }
            });
        }
    });
}
