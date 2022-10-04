
export class MultiMap<K,V> {
    items = new Map<K, Array<V>>()

    add(key: K, item: V) {
        if (!this.items.has(key))
            this.items.set(key, []);
        this.items.get(key).push(item);
    }

    has(key: K) {
        return this.items.has(key);
    }

    get(key: K): Array<V> {
        return this.items.get(key) || [];
    }

    keys() {
        return this.items.keys();
    }

    entries() {
        return this.items.entries();
    }

    size() {
        return this.items.size;
    }
}
