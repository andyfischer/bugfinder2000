

export type AttrValue = boolean | number | string | null | Buffer | any

export type Item = any | {
    [attr: string]: AttrValue
}

export function has(item: Item, attr: string) {
    if ((item as any).t)
        throw new Error(`don't call has() on item of type: ` + item.t);

    return item[attr] !== undefined;
}

export function get(item: Item, attr: string) {
    return item[attr];
}

export function set(item: Item, attr: string, value: any) {
    item[attr] = value;
}

export function attrs(item: Item) {
    return Object.keys(item);
}

export function entries(item: Item) {
    return Object.entries(item);
}

export function shallowCopy(item: Item) {
    return { ...item };
}

export function newItem(): Item {
    return {}
}

export function isItem(value: any) {
    return !!value && typeof value === 'object';
}
