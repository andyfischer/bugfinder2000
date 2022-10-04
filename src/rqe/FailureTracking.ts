
import { getGraph } from './globalGraph'
import { Graph } from './Graph'
import { formatItem } from './format/formatItem'
import { IDSource } from './utils/IDSource'
import { ErrorItem, captureExceptionAsErrorItem } from './Errors'

let _samplingCheckCount = 0;
let _samplingCheckTimer = null;
let _nextFailureId = new IDSource('fail-');

const RESET_INTERVAL_MS = 1000;
const SAMPLE_50_PCT_AT_COUNT = 100;
const SAMPLE_10_PCT_AT_COUNT = 1000;
const SAMPLE_0_AT_COUNT = 5000;

export interface Failure {
    failure_id: string
    message: string
    stack: any
    check_attrs: any
}

export function shouldCheck() {
    _samplingCheckCount++;

    if (!_samplingCheckTimer) {
        _samplingCheckTimer = setTimeout((() => {
            _samplingCheckCount = 0;
            _samplingCheckTimer = null;
        }), RESET_INTERVAL_MS);
    }

    if (_samplingCheckCount > SAMPLE_0_AT_COUNT)
        return false;

    if (_samplingCheckCount > SAMPLE_10_PCT_AT_COUNT)
        return Math.random() > .9;

    if (_samplingCheckCount > SAMPLE_50_PCT_AT_COUNT)
        return Math.random() > .5;

    return true;
}

export interface FailureAttrs {
    graph?: Graph
    [ key: string ]: any
}

export function recordFailure(message: string, attrs: FailureAttrs = {}) {
    const failure_id = _nextFailureId.take();
    const graph = attrs.graph || getGraph();
    const table = graph.builtins.failures();
    let stack = (new Error()).stack;
    stack = stack.split('\n').slice(2).join('\n');

    const remainingAttrs = {
        ...attrs,
    }

    delete remainingAttrs.graph;

    table.put({
        message,
        failure_id,
        check_attrs: remainingAttrs,
        stack,
    });

    let formattedStackTrace = ''+stack;
    formattedStackTrace = formattedStackTrace.split('\n').slice(1).join('\n');

    if (!graph.silentFailures)
        console.error(`failure: ${message} ${formatItem(remainingAttrs)}\n${formattedStackTrace}`);

    return failure_id;
}

export function recordUnhandledError(error: ErrorItem, graph?: Graph) {
    const failure_id = _nextFailureId.take();
    graph = graph || getGraph();
    const table = graph.builtins.failures();
    let stack = error.stack || (new Error()).stack;

    table.put({
        message: error.message,
        failure_id,
        check_attrs: error,
        stack,
    });

    let formattedStackTrace = ''+stack;
    formattedStackTrace = formattedStackTrace.split('\n').slice(1).join('\n');

    if (!graph.silentFailures)
        console.error(`failure: ${error.message}\n${formattedStackTrace}`);

    return failure_id;
}

export function recordUnhandledException(e: Error, graph?: Graph) {
    const item = captureExceptionAsErrorItem(e);
    recordUnhandledError(item, graph);
}
