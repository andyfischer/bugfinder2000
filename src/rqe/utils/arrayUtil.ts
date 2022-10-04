
export function maybeArray<T>(item: T | T[]): T[] {
    if (Array.isArray(item))
        return item;
    return [item];
}
