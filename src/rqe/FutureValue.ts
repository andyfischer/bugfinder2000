
import { StreamEvent, StreamError, StreamDone } from './Stream'
import { newErrorFromItems } from './Errors'
import { Item, get } from './Item'
import { QueryLike, toQuery } from './Query'
import { newError } from './Errors'

type Callback = (msg: StreamEvent | StreamError | StreamDone) => void

export class FutureValue {
    msg: StreamEvent | StreamError | StreamDone = null
    downstream: Callback
    originalQuery: QueryLike

    constructor(originalQuery?: QueryLike) {
        this.originalQuery = originalQuery;
    }

    callback(callback: Callback) {
        if (this.downstream)
            throw new Error("FutureValue already has a downstream");

        this.downstream = callback;

        if (this.msg) {
            callback(this.msg);
        }
    }

    receive(msg: StreamEvent) {
        if (this.msg) {
            return;
        }

        switch (msg.t) {
        case 'item':
        case 'error':
        case 'done':
            this.msg = msg;
            if (this.downstream)
                this.downstream(msg);
            return;
        }
    }

    sync() {
        if (this.msg == null) {
            let message = `Query didn't finish synchronously`
            if (this.originalQuery)
                message += ` (${toQuery(this.originalQuery).toQueryString()})`;

            throw newError({
                message,
                fromQuery: this.originalQuery,
            });
        }

        switch (this.msg.t) {
            case 'item':
                return this.msg.item;
            case 'error':
                throw newErrorFromItems([ this.msg.item ]);
            case 'done': {
                let message = `Query didn't produce any value`
                if (this.originalQuery)
                    message += ` (${toQuery(this.originalQuery).toQueryString()})`;
                throw newError({
                    message,
                    fromQuery: this.originalQuery,
                });
            }
        }
    }

    // Use as a Promise
    then(onResolve?: (item: Item) => any, onReject?): Promise<Item> {
        let promise = new Promise((resolve, reject) => {
            this.callback(msg => {
                switch (msg.t) {
                case 'item':
                    resolve(msg.item);
                    break;
                case 'error':
                    reject(msg.item);
                    break;
                case 'done': {
                    let message = `Query didn't produce any value`
                    if (this.originalQuery)
                        message += ` (${toQuery(this.originalQuery).toQueryString()})`;
                    
                    reject(newError({
                        message,
                        fromQuery: this.originalQuery,
                    }));
                    break;
                }
                }
            });
        });

        if (onResolve || onResolve)
            promise = promise.then(onResolve, onReject);

        return promise;
    }

    attr(attr: string) {
        return new FutureAttr(this, attr);
    }
}

export class FutureAttr {
    value: FutureValue
    attr: string

    constructor(value: FutureValue, attr: string) {
        this.value = value;
        this.attr = attr;
    }

    sync() {
        return get(this.value.sync(), this.attr);
    }

    then(onResolve?: (item: Item) => any, onReject?): Promise<Item> {
        let promise = this.value.then(item => get(item, this.attr));

        if (onResolve || onResolve)
            promise = promise.then(onResolve, onReject);

        return promise;
    }
}
