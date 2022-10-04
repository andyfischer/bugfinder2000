
export default class EntitySet<V> {
    idPrefix: string
    nextId = 1;
    map = new Map<string,V>()

    constructor({ idPrefix }: { idPrefix?: string } = {}) {
        this.idPrefix = idPrefix || '';
    }

    get(id: string) {
        return this.map.get(id);
    }

    has(id: string) {
        return this.map.has(id);
    }

    add(item: V) {
        const id = this.idPrefix + this.nextId;
        this.nextId++;
        this.map.set(id, item);
        return id;
    }

    delete(id: string) {
        this.map.delete(id);
    }

    entries() {
        return this.map.entries();
    }

    items() {
        return this.map.values();
    }
}

