
import { AttrSet, AttrMap, LooseAttrList } from '.'
import { header, itemGlobalId } from './ObjectHeader'
import { Table } from '.'
import { get, has, Item } from '../Item'

function valueToKeyString(value: any) {
    if (value == null || value == undefined) {
        return null;
    }

    const itemHeader = header(value);

    if (itemHeader) {
        if (!itemHeader.table)
            return value + '';

        return itemGlobalId(itemHeader);
    }

    return value + '';
}

export default class TableIndex<ValueType> {
    table: Table
    attrSet: AttrSet
    attrs: string[]
    data = new Map<string, Map<any,any>>()

    constructor(table: Table, attrs: LooseAttrList) {
        this.table = table;

        if (!Array.isArray(attrs))
            attrs = [attrs];

        attrs.sort();
        this.attrs = attrs;

        this.attrSet = new Map<string, true>();
        for (const attr of attrs)
            this.attrSet.set(attr, true);
    }

    toKey(attrs: Map<string, any>) {
        let key = [];

        for (const attr of this.attrs) {
            const value = attrs.get(attr);
            key.push(valueToKeyString(value));
        }

        return key.join(',');
    }

    toKeyUsingItem(item: ValueType) {
        let key = [];

        for (const attr of this.attrs) {
            const value = get(item, attr);
            key.push(valueToKeyString(value));
        }

        return key.join(',');
    }

    *get(attrs: AttrMap) {
        const key = this.toKey(attrs);
        const bucket = this.data.get(key);
        if (!bucket)
            return;

        yield* this.data.get(key).values();
    }

    getOne(attrs: AttrMap) {
        for (const item of this.get(attrs))
            return item;
        return null;
    }

    insert(item: ValueType) {
        const key = this.toKeyUsingItem(item);
        let bucket = this.data.get(key);
        if (!bucket) {
            bucket = new Map();
            this.data.set(key, bucket);
        }

        const itemHeader = header(item);
        bucket.set(itemHeader.tableInternalKey, item);
    }

    remove(item: ValueType) {
        const key = this.toKeyUsingItem(item);
        let bucket = this.data.get(key);
        if (!bucket)
            return;

        bucket.delete(header(item).tableInternalKey);
        
        if (bucket.size === 0)
            this.data.delete(key);
    }

    coversItem(item: Item) {
        for (const requiredAttr of this.attrs) {
            if (!has(item, requiredAttr))
                return false;
        }
        return true;
    }

    matchesAttrList(attrs: string[]) {
        if (this.attrs.length !== attrs.length)
            return false;

        for (const attr of attrs)
            if (!this.attrSet.has(attr))
                return false;

        return true;
    }

    coversSingleAttribute(attr: string) {
        return (this.attrs.length === 1 && this.attrs[0] === attr)
    }

    rebuild() {
        this.data = new Map();
        for (const item of this.table.scan())
            this.insert(item);
    }
}
