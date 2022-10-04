
import { MountPointRef } from './MountPoint'
import { BackpressureStop } from './Stream'
import { QueryTuple } from './QueryTuple'
import { Task } from './Step'
import { captureExceptionAsErrorItem } from './Errors'
import { Stream } from './Stream'
import { Table } from './Table'
import { Item } from './Item'

export type NativeCallback = (task: Task) => void | Item | Array<Item> | Stream | Table
    | Promise<Item> | Promise<Array<Item>> | Promise<Stream> | Promise<Table>

export function runNativeFunc(step: Task, pointRef: MountPointRef) {

    const graph = step.graph;

    const point = graph.getMountPoint(pointRef);
    if (!point)
        throw new Error("mount point ref not resolved: " + JSON.stringify(pointRef));

    if (!point.attrs)
        throw new Error("not a valid MountPoint object: " + point);

    if (graph.hookNativeFunc) {
        const result = graph.hookNativeFunc(step);
        if (result?.t === 'done')
            return;
    }

    if (!point.callback)
        throw new Error("MountPoint has no .callback");


    runNativeFunc2(step, point.callback);
}

export function runNativeFunc2(step: Task, callback: NativeCallback) {

    try {
        let data: any = callback(step)

        handleCallbackOutput(step, step.tuple, data);

    } catch (e) {

        if ((e as BackpressureStop).backpressure_stop) {
            // Function is deliberately being killed by a BackpressureStop exception. Not an error.
            step.output.sendDoneIfNeeded();
            return;
        }

        const errorItem = captureExceptionAsErrorItem(e, { fromQuery: step.tupleWithoutParams });
        step.output.sendErrorItem(errorItem);
        step.output.sendDoneIfNeeded();
        return;
    }

    // Automatically call 'done' if the call is not async.
    if (!step.declaredAsync && !step.declaredStreaming) {
        step.output.sendDoneIfNeeded();
    }
}

function handleCallbackOutput(step: Task, tuple: QueryTuple, data: any) {
    
    if (!data)
        return;

    if (data.t === 'stream') {
        step.streaming();
        data.sendTo(step.output);
        return;
    }

    if (data.t === 'table') {
        for (const item of data.scan())
            step.put(item);
        return;
    }

    if (data.then) {

        if (!step.declaredStreaming) {
            // Implicit async
            step.async();
        }

        return data.then(data => {
            if (!data) {
                if (!step.declaredStreaming)
                    step.output.sendDoneIfNeeded();
                return;
            }

            if (data.t === 'stream') {
                step.streaming();
                data.sendTo(step.output);
            } else if (data.t === 'table') {
                for (const item of data.scan())
                    step.put(item);
            } else if (Array.isArray(data)) {
                for (const el of data)
                    step.put(el);
            } else {
                step.put(data);
            }

            if (!step.declaredStreaming)
                step.output.sendDoneIfNeeded();

        })
        .catch(e => {

            if ((e as BackpressureStop).backpressure_stop) {
                // Function is deliberately being killed by a BackpressureStop exception. Not an error.
                step.output.sendDoneIfNeeded();
                return;
            }

            // console.error(e);

            const errorItem = captureExceptionAsErrorItem(e, {fromQuery: tuple});
            step.output.sendErrorItem(errorItem);
            step.output.sendDoneIfNeeded();
            return;
        });
    }

    if (Array.isArray(data)) {
        for (const el of data)
            step.put(el);
        return;
    }

    step.put(data);
}
