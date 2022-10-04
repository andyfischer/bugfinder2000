
export class LazyMap<K,V> {
    init: (k:K) => V
    map = new Map<K,V>()

    constructor(init: (k:K) => V) {
        this.init = init;
    }

    get(k: K) {
        if (!this.map.has(k)) {
            let val = this.init(k);
            this.map.set(k, val);
            return val;
        } else {
            return this.map.get(k);
        }
    }

    getExisting(k: K) {
        return this.map.get(k);
    }

    set(k: K, v: V) {
        return this.map.set(k,v);
    }

    has(k: K) {
        return this.map.has(k);
    }

    values() {
        return this.map.values();
    }
    entries() {
        return this.map.entries();
    }
}
