
import * as child_process from 'child_process'
import { Table } from '../Table'
import { getExitCallbacksTable } from './ProcessExit'
import { newTable, log } from '../globalGraph'
import { Graph } from '../Graph'

type ChildProcessOptions = Parameters<typeof child_process.spawn>[2];

interface ActiveProc {
    id?: string
    proc: any
    cmd: string
    args: string[]
}

export const active_procs = newTable<ActiveProc>({
    attrs: {
        active_procs: {},
        cmd: {},
        args: {},
        id: { generate: { method: 'increment', prefix: 'proc-' } },
        proc: {},
    },
    funcs: [
        'active_procs $id ->'
    ]
});

let _hasRegisteredOnExitCallback = false;

export function spawn(graph: Graph, cmd: string, args: string[], options: ChildProcessOptions) {

    if (!_hasRegisteredOnExitCallback) {
        getExitCallbacksTable().put({
            callback: () => {
                for (const { id, proc } of active_procs.scan()) {
                    log('subprocess', 'killing leftover process: ' + id);
                    proc.kill();
                }
            }
        });
        _hasRegisteredOnExitCallback = true;
    }

    const proc = child_process.spawn(cmd, args, options);

    const { id } = active_procs.put({ cmd, args, proc });

    proc.on('spawn', () => {
        graph.logging.put('subprocess', `started child process (${id}): ${cmd} ${args.join(' ')}`);
    });

    proc.on('exit', () => {
        graph.logging.put('subprocess', `child process exited (${id}): ${cmd} ${args.join(' ')}`);
        active_procs.delete({ id });
    });

    proc['id'] = id;

    return proc;
}

export const procs = new Table({
    attrs: {
        proc: {}
    }
});
