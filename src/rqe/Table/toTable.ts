
import { Table } from '.'

export type TableLike<T> = Array<T> | Table<T>

export function toTable<T>(tableLike: TableLike<T>): Table<T> {
    if (Array.isArray(tableLike)) {
        const table = new Table<T>({});
        table.putItems(tableLike);
        return table;
    }

    return tableLike;
}
