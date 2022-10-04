
import { Graph } from '../Graph'
import { getGraph } from '../globalGraph'
import { Table } from '../Table'
import { Handler, parseHandler } from '../Handler'
import { Task } from '../Step'
import { StreamReceiver, StreamEvent } from '../Stream'
import { QueryModifier } from '../Query'
import { c_done, c_error } from '../Enums'
import { timestampNow } from '../utils/timestamp'

interface Options {
    graph?: Graph
    table?: Table
    queryModifier?: QueryModifier
    ttlMs?: number
    ttlOnErrorMs?: number
}

class InProgressCachingStream implements StreamReceiver {
    /*
     * InProgressCachingStream
     *
     * Stores all events in a list for later caching.
     *
     * Also supports having any number of downstream listeners. When a listener
     * is added it will receive all the past events.
     */

    receivedEvents: StreamEvent[] = []
    listeners: StreamReceiver[] = []

    addListener(receiver: StreamReceiver) {
        this.listeners.push(receiver);

        for (const evt of this.receivedEvents)
            receiver.receive(evt);
    }

    receive(evt: StreamEvent) {
        this.receivedEvents.push(evt);
        for (const listener of this.listeners)
            listener.receive(evt);
    }
}

export function setupCacherv2(handler: Handler | string, options: Options): Handler {
    handler = parseHandler(handler);
    
    const graph = options.graph || getGraph();
    const table = options.table || graph.builtins.get('cache_v2');
    const queryModifier = options.queryModifier || { with: 'no-cache' };
    const func_decl = handler.toDeclString();

    if (!table.hasAttr('input_tuple'))
        throw new Error('table is missing: input_tuple');

    if (!table.hasAttr('in_progress_stream'))
        throw new Error('table is missing: in_progress_stream');

    if (!table.hasAttr('finished_events'))
        throw new Error('table is missing: finished_events');

    if (!table.hasAttr('cached_at'))
        throw new Error('table is missing: cached_at');

    if (!table.hasAttr('expire_at'))
        throw new Error('table is missing: expire_at');

    return handler.withCallback((task: Task) => {
        const input_tuple = task.tuple.toQueryString();
        let found = table.one({ input_tuple });
        let now = Date.now();

        if (found && found.expire_at) {
            // Check the expire_at time.
            
            if (now >= (new Date(found.expire_at)).getTime()) {
                // Expired
                found = null;
            }
        }

        if (found) {
            // Use value from cache
            task.streaming();

            if (found.in_progress_stream) {
                found.in_progress_stream.addListener(task.output);
            } else if (found.finished_events) {
                for (const evt of found.finished_events)
                    task.output.receive(evt);
            }

            return;
        }

        // Not found. Run the backing func and store the output in cache.

        // First create an in-progress stream, which will be used if there
        // are any calls while this function is still in progress.
        const in_progress_stream = new InProgressCachingStream();

        let expire_at = null;

        if (options.ttlMs) {
            expire_at = new Date(now + options.ttlMs).toISOString();
        }

        table.put({
            func_decl,
            input_tuple,
            in_progress_stream,
            finished_events: null,
            cached_at: timestampNow(),
            expire_at,
        });

        task.streaming();

        let sawError = false;
        in_progress_stream.addListener({
            receive(evt) {

                if (evt.t === c_error)
                    sawError = true;

                if (evt.t === c_done) {
                    // Backing function is done, update the cache table to just
                    // store 'finished_events' instead of the in_progress_stream.
                    
                    let now = Date.now();
                    let expire_at = null;

                    if (sawError && options.ttlOnErrorMs)
                        expire_at = new Date(now + options.ttlOnErrorMs).toISOString();
                    else if (options.ttlMs)
                        expire_at = new Date(now + options.ttlMs).toISOString();

                    table.put({
                        func_decl,
                        input_tuple,
                        in_progress_stream: null,
                        finished_events: in_progress_stream.receivedEvents,
                        cached_at: timestampNow(),
                        expire_at,
                    });
                }

                task.output.receive(evt);
            }
        });

        let output = task.queryRelated(queryModifier);
        output.sendTo({
            receive(evt) {
                if (evt.t === 'schema')
                    return;
                in_progress_stream.receive(evt);
            }
        });
    });
}
