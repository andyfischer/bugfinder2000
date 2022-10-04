
import { Table } from '../Table'
import { Stream } from '../Stream'

export function bulkReplaceTable(destination: Table) {
    const stream = new Stream();

    const items = [];

    // TODO: Could be smarter about not deleting items that are already there.

    stream.sendTo({
        receive(msg) {
            switch (msg.t) {
            case 'item':
                items.push(msg.item);
                break;

            case 'done':
                destination.deleteAll();
                for (const item of items)
                    destination.put(item);
                break;
            }
        }
    });

    return stream;
}
