
export function mapValues(obj: any, callback: (v, k) => any) {
    let out = {};
    for (let [k, v] of Object.entries(obj)) {
        v = callback(v, k);
        out[k] = v;
    }
    return out;
}
