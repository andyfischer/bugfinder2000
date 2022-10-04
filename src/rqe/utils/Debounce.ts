/**

Helper class for calling a function, but not calling it too often.

Every call is delayed by `delayMs` (default 0). Only one call is made
for each delay.

*/

export default class Debounce {
    callback = null;
    delayMs: number
    pending = null;
    pendingArgs: any[]

    constructor(callback: (...args: any[]) => void, delayMs: number = 0) {
        this.delayMs = delayMs;
        this.callback = callback;
    }

    post(...args: any[]) {
        this.pendingArgs = args;
        if (!this.pending) {
            this.pending = setTimeout(() => this.fire(), this.delayMs);
        }
    }

    fire() {
        delete this.pending;
        const args = this.pendingArgs;
        delete this.pendingArgs;
        this.callback.apply(null, args);
    }

    cancel() {
        clearTimeout(this.pending);
        delete this.pending;
    }
}

