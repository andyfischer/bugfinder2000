
export class PromisedEvent {

    _promise: any
    _resolve: any

    wait(): Promise<any> {
        if (!this._promise) {
            this._promise = new Promise(resolve => {
                this._resolve = resolve;
            });
        }

        return this._promise;
    }

    resolve() {
        this._resolve();
    }
}

