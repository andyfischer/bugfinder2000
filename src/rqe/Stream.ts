
import { Item } from './Item'
import { Table } from './Table/index'
import { c_done, c_item, c_error } from './Enums'
import { newError, ErrorItem, ErrorType } from './Errors'
import { IDSourceNumber as IDSource } from './utils/IDSource'
import { streamingTransform, StreamingTransformFunc, StreamingTransformOptions } from './utils/streamUtil'
import { StreamSuperTrace, StreamSuperDuperTrace, StreamOverflowCheck, StreamOverflowCheckMs } from './config'
import { FutureValue } from './FutureValue'
import { recordFailure } from './FailureTracking'
import { Graph } from './Graph'
import { ErrorExtended, captureExceptionAsErrorItem, collectErrorItems } from './Errors'
import { openAsyncIterator } from './utils/openAsyncIterator'

interface StreamItem {
    t: 'item',
    item: any
}

export interface StreamDone {
    t: 'done',
}

export interface StreamError {
    t: 'error',
    item: ErrorItem
}

export interface StreamHeader {
    t: 'header'
    item: Item
}

export interface StreamPatchMode {
    t: 'patch_mode'
}

export interface StreamStartPatch {
    t: 'start_patch'
    replaceAll?: boolean
}

export interface StreamFinishPatch {
    t: 'finish_patch'
}

export interface StreamDelete {
    t: 'delete',
    item: any
}

export interface AttrSchema {
    type?: string
}

export interface SchemaItem {
   [attr: string]: AttrSchema
}

export interface StreamSchema {
    t: 'schema'
    item: SchemaItem
}

export type TransformFunc = (item: Item) => Item | Item[]
export type AggregationFunc = (item: Item[]) => Item | Item[]
export type StreamEvent = StreamHeader | StreamItem | StreamDone | StreamError | StreamSchema
    | StreamPatchMode | StreamStartPatch | StreamFinishPatch | StreamDelete

export interface StreamReceiver {
    receive(data: StreamEvent): void
}

const nextStreamId = new IDSource();

export class Stream implements StreamReceiver {
    t = 'stream'
    id: number
    label?: string
    graph?: Graph
    downstream: StreamReceiver = null
    receivedDone = false;
    closedWithError: ErrorItem | null
    patchMode: PatchModeInfo = null

    // Backlog data (if the output isn't connected yet)
    _backlog: StreamEvent[]

    _backpressureStop: boolean

    constructor(graph?: Graph, label?: string) {
        this.graph = graph;
        this.label = label;
        this.id = nextStreamId.take();
    }

    isStream() {
        return true;
    }

    isDone() {
        return this.receivedDone;
    }

    isDoneAndEmpty() {
        if (this.downstream)
            throw new Error("can't check .isDoneAndEmpty, already have a downstream");
        return this.receivedDone && this._backlog.length === 0;
    }

    hasDownstream() {
        return !!this.downstream;
    }

    isKnownEmpty() {
        return this.receivedDone && !this.downstream && (!this._backlog || this._backlog.length === 0);
    }

    getDebugLabel() {
        let out = `#${this.id}`
        if (this.label)
            out += ` (${this.label})`;
        return out;
    }

    receive(data: StreamEvent) {
        if (StreamSuperTrace || StreamSuperDuperTrace) {
            console.log(`Stream ${this.getDebugLabel()} received:`, data);

            if (StreamSuperDuperTrace) {
                const trace = ((new Error()).stack + '').replace(/^Error:/, '');
                console.log('at: ' + trace);
            }
        }

        if (data.t === 'item' && data.item.t) {
            throw new Error("Value should not be sent in a Stream, type = " + data.item.t);
        }


        if (data.t !== 'done' && this._backpressureStop) {
            // console.log('throwing backpressure stop');
            throw new BackpressureStop();
        }

        if (this.receivedDone) {
            if (this.closedWithError) {
                throw new ErrorExtended(this.closedWithError);
            }

            throw new Error(`Stream ${this.getDebugLabel()} received more data after 'done'`);
        }

        if (data.t === 'done')
            this.receivedDone = true;

        if (data.t === 'patch_mode') {
            this.patchMode = {
                overflowCheck: null
            };

            if (StreamOverflowCheck) {
                if (!this.hasDownstream()) {
                    this.patchMode.overflowCheck = setTimeout(() => this.onOverflowCheckTimeout(), StreamOverflowCheckMs);
                }
            }
        }

        if (this.downstream) {
            try {
                this.downstream.receive(data);
            } catch (e) {
                if (!e['backpressure_stop'])
                    this.forceClose(captureExceptionAsErrorItem(e));
                throw e;
            }
        } else {
            this._backlog = this._backlog || [];
            this._backlog.push(data);
        }
    }

    sendTo(receiver: StreamReceiver) {
        if (this.hasDownstream())
            throw new Error("Stream already has a downstream");

        this.downstream = receiver;

        if (StreamSuperTrace) {
            console.log(`Stream ${this.getDebugLabel()} is now sending to:`,
                        (receiver as any).getDebugLabel ? (receiver as any).getDebugLabel() : 'anonymous receiver');
        }

        if (this._backlog) {
            // Send the pending backlog.
            const backlog = this._backlog;
            delete this._backlog;

            for (const data of backlog) {
                try {
                    this.downstream.receive(data);
                } catch (e) {
                    if (!e['backpressure_stop'])
                        this.forceClose(captureExceptionAsErrorItem(e));

                    throw e;
                }
            }
        }
    }

    onOverflowCheckTimeout() {
        if (!this.hasDownstream()) {
            recordFailure(`Stream entered patch mode but has no listener (after ${StreamOverflowCheckMs / 1000} sec)`, { graph: this.graph });

            this.forceClose({errorType: 'patch_mode_listener_timeout'});
        }
    }

    transform(output: StreamReceiver, callback: TransformFunc) {
        this.sendTo({
            receive: (msg) => {
                switch (msg.t) {
                    case c_item:

                        let result = callback(msg.item) || [];
                        if (Array.isArray(result)) {
                            for (const newItem of (result as Item[]))
                                output.receive({t: c_item, item: newItem });
                        } else { 
                            output.receive({t: c_item, item: result });
                        }

                        break;
                    default:
                        output.receive(msg);
                }
            }
        });
    }

    tap(callback: (msg: StreamEvent) => void) {
        const stream = new Stream(this.graph);

        this.sendTo({
            receive(msg) {
                callback(msg);
                stream.receive(msg);
            }
        });

        return stream;
    }

    tapItems(callback: (item: Item) => void) {
        const stream = new Stream(this.graph);

        this.sendTo({
            receive(msg) {
                if (msg.t === c_item) {
                    try {
                        callback(msg.item);
                    } catch (err) {
                        console.error(err);
                    }
                }
                stream.receive(msg);
            }
        });

        return stream;
    }

    toTransform(callback: TransformFunc) {
        const output = new Stream(this.graph);
        this.transform(output, callback);
        return output;
    }

    streamingTransform(output: Stream, callback: StreamingTransformFunc, options: StreamingTransformOptions = {}) {
        streamingTransform(this, output, callback, options);
    }

    aggregate(receiver: StreamReceiver, callback: AggregationFunc) {

        let items: Item[] = [];

        this.sendTo({
            receive: (msg) => {
                switch (msg.t) {
                    case c_item:
                        items.push(msg.item);
                        break;

                    case c_done:
                        const result = callback(items);
                        items = [];
                        for (const item of result)
                            receiver.receive({t: c_item, item });
                        receiver.receive({t: c_done});
                        break;

                    default:
                        receiver.receive(msg);
                }
            }
        });
    }

    async collect(): Promise<Table> {
        return new Promise<Table>((resolve, reject) => {
            this.callback(table => {
                if (table.hasError())
                    reject(table.errorsToException());
                else
                    resolve(table);
            });
        });
    }

    async collectWithErrors(): Promise<Table> {
        return new Promise<Table>((resolve, reject) => {
            this.callback(table => {
                resolve(table);
            });
        });
    }

    // Use as a Promise
    then(onResolve?: (result: Table) => any, onReject?): Promise<Table> {
        let promise = this.collect();

        if (onResolve || onReject)
            promise = promise.then(onResolve, onReject);

        return promise;
    }

    callback(callback: (table: Table) => void) {

        const result = new Table({
            name: 'QueryResult'
        });

        let hasCalledDone = false;

        this.sendTo({
            receive(data: StreamEvent) {
                if (hasCalledDone) {
                    throw new Error("got message after 'done': " + data.t);
                }

                switch (data.t) {
                case 'item':
                    result.put(data.item);
                    break;
                case 'error':
                    result.putError(data.item);
                    break;
                case 'done':
                    hasCalledDone = true;
                    callback(result);
                    break;
                case 'header':
                    result.putHeader(data.item);
                    break;
                case 'schema':
                    // TODO - use this schema in the table?
                    break;
                case 'patch_mode':
                    break;
                default:
                    throw new Error("unhandled case in Stream.callback: " + (data as any).t);
                }
            }
        });
    }

    sync(opts?: 'with_errors' | null): Table {
        let out: Table;

        this.callback(r => { out = r });

        if (out == null)
            throw new Error("Stream didn't finish synchronously");

        if (opts !== 'with_errors') {
            if (out.hasError()) {
                throw new ErrorExtended(collectErrorItems(out._errors.list()));
            }
        }

        return out;
    }

    strs() {
        return this.sync().strs();
    }

    // Consume this stream as a sync iterator.
    *[Symbol.iterator]() {
        const table = this.sync();
        yield* table.scan();
    }
    
    // Consume this stream as an async iterator.
    async* [Symbol.asyncIterator]() {

        const { send, iterator } = openAsyncIterator();

        this.sendTo({ receive: send });

        for await (const evt of iterator) {
            switch (evt.t) {
            case c_done:
                return;
            case c_item:
                yield evt.item;
                break;
            case c_error:
                throw newError(evt.item);
            }
        }
    }

    one() {
        const value = new FutureValue();
        this.sendTo(value);
        return value;
    }

    oneAttr(attr: string) {
        return this.one().attr(attr);
    }

    takeEvents(): StreamEvent[] {
        if (this.downstream)
            throw new Error("can't take(), stream has a downstream");

        const items = this._backlog;
        this._backlog = [];
        return items;
    }

    take() {
        if (!this.receivedDone)
            throw new Error("can't take(), stream is not yet closed");

        if (this.downstream)
            throw new Error("can't take(), stream has a downstream");

        const items = [];

        for (const data of this._backlog) {
            switch (data.t) {
                case 'item':
                    items.push(data.item);
            }
        }
        this._backlog = [];

        return items;
    }

    takeItemsAndErrors() {
        if (!this.receivedDone)
            throw new Error("can't take(), stream is not yet closed");

        if (this.downstream)
            throw new Error("can't take(), stream has a downstream");

        const items = [];
        const errors = [];

        for (const data of this._backlog) {
            switch (data.t) {
                case 'item':
                    items.push(data.item);
                    break;
                case 'error':
                    errors.push(data.item);
                    break;
            }
        }

        this._backlog = [];

        return [ items, errors ];
    }

    putHeader(item: Item) {
        this.receive({ t: 'header', item });
    }

    putSchema(item: SchemaItem) {
        this.receive({ t: 'schema', item });
    }

    put(item: Item) {
        this.receive({ t: 'item', item });
    }

    putError(item: ErrorItem) {
        this.receive({ t: 'error', item });
    }

    errorAndClose(item: ErrorItem) {
        this.receive({ t: 'error', item });
        this.done();
    }

    putTableItems(table: Table) {
        for (const item of table.scan())
            this.put(item);
    }

    sendError(type: ErrorType, data?: any) {
        this.receive({ t: 'error', item: { errorType: type, ...data } });
    }

    sendErrorItem(item: ErrorItem) {
        this.receive({ t: 'error', item });
    }

    sendUnhandledError(error: Error) {
        // console.error(error);
        this.sendError('unhandled_error', { message: error.message, stack: error.stack });
    }

    close() {
        this.receive({t: 'done'});
    }

    forceClose(error: ErrorItem) {
        
        if (this.closedWithError)
            return;

        // Throw out backlog to avoid memory leaks.
        if (this._backlog) {
            this._backlog = [];
        }

        if (this.patchMode) {
            // Not an error to force close a patch-mode stream.
            // TODO: what if we remove this special case? can we expect the client to
            // just ignore this?
            if (!this.receivedDone) {
                this.close();
            }
        } else {
            this.closedWithError = error;
            this.receive({t: 'error', item: error});
            this.close();
        }
    }

    closeWithError(message: string) {
        this.receive({t: 'error', item: { errorType: 'unhandled_error', message }});
        this.receive({t: 'done'});
    }

    closeWithErrorIfOpen(error: ErrorItem) {
        if (!this.receivedDone) {
            this.receive({t: 'error', item: error});
            this.receive({t: 'done'});
        }
    }

    closeWithUnhandledError(e: Error) {
        // console.error(e);

        if (this.receivedDone) {
            console.error("Tried to close pipe with error, but pipe is already closed. Error: ", e.stack || e);
            return;
        }

        this.receive({t: 'error', item: { errorType: 'unhandled_error', message: e.message || e.toString(), stack: e.stack } });
        this.receive({t: 'done'});
    }

    done() {
        this.receive({t: 'done'});
    }


    sendDoneIfNeeded() {
        if (!this.receivedDone)
            this.receive({t: 'done'});
    }

    setBackpressureStop() {
        this._backpressureStop = true;
    }
    
    static newEmptyStream() {
        const stream = new Stream(null, 'newEmptyStream');
        stream.done();
        return stream;
    }

    static fromList(items: Item[]) {
        const stream = new Stream(null, 'fromList');
        for (const item of items)
            stream.put(item);
        stream.done();
        return stream;
    }

    static newStreamToReceiver(receiver: StreamReceiver) {
        const stream = new Stream(null, 'newStreamToReceiver');
        stream.sendTo(receiver);
        return stream;
    }

    static errorToStream(item: ErrorItem) {
        const stream = new Stream(null);
        stream.sendErrorItem(item);
        stream.done();
        return stream;
    }
}

interface PatchModeInfo {
    overflowCheck: any
}

export class BackpressureStop extends Error {
    backpressure_stop = true

    constructor() {
        super("Can't put to stream (backpressure stop)");
    }
}
