
function round(n, sigfigs) {
    return Math.round(n * (10 ** sigfigs)) / (10 ** sigfigs);
}

export class Timer {
    start: number

    constructor() {
        this.start = Date.now();
    }

    toString() {
        const elapsedMs = Date.now() - this.start;

        if (elapsedMs > 500) {
            return `${round(elapsedMs / 1000, 1)}s`
        }

        return `${elapsedMs}ms`
    }
}
