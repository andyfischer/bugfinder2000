
export function groupBy<T>(it: Iterable<T>, keyFn: (T) => string): T[][] {
    const map = new Map<string, [T]>();
    for (const item of it) {
        const key = keyFn(item);
        if (map.has(key))
            map.get(key).push(item);
        else
            map.set(key, [item]);
    }

    return Array.from(map.values());
}

function toStringSet(list: string[]) {
    const map = new Map<string, true>();
    for (const item of list)
        map.set(item, true);
    return map
}
