
import { Table } from '../Table'
import { timedOut } from '../utils/promiseUtil'

let _startedGracefulExit = false;
let _didOverrideProcessExit = false;
let _actualProcessExit = null;
let _exitCallbacksTable;

interface OnExitCallback {
    callback: () => void
}

export function getExitCallbacksTable() {
    if (!_exitCallbacksTable) {
        _exitCallbacksTable = new Table<OnExitCallback>({
            attrs: {
                callback: {}
            }
        });
    }

    return _exitCallbacksTable;
}

export function overrideProcessExit() {
    if (_didOverrideProcessExit)
        return;

    _didOverrideProcessExit = true;
    _actualProcessExit = process.exit;
    process.exit = gracefulExit as any;
}

export async function gracefulExit(exitCode: number = 0) {
    if (_startedGracefulExit)
        return;
    _startedGracefulExit = true;

    process.exitCode = exitCode;

    let promises = [];
    for (const { callback } of getExitCallbacksTable().scan()) {
        try {
            const result = callback()
            promises.push(result);
        } catch (err) {
            console.error(err);
        }
    }

    const timeoutMs = 500;
    const allSettled = Promise.allSettled(promises);

    if (await timedOut(allSettled, timeoutMs)) {
        console.error(`timed out (${timeoutMs}ms) waiting for all on_exit callbacks`);
    }

    if (_actualProcessExit)
        _actualProcessExit()
    else
        process.exit();
}

process.on('SIGINT', () => gracefulExit(0));
