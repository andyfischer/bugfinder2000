
import * as ChildProcess from 'child_process'
import { Graph } from '../../Graph'
import { startConsoleRepl } from '../consoleRepl'
import { getGraph } from '../../globalGraph'
import { Table } from '../../Table'
import { ansi } from '../3rdparty/ansi'
import ansiRegex from '../3rdparty/ansi-regex'

interface ProcessOptions {
    logPrefix: string
    logColor?: any
}

function outputToLines(msg: string) {
  return msg
    .toString()
    .split('\n')
    .filter((line) => line !== '');
}

const liveProcessTables = new Table<Table>({});
let hasSetupExitListener = false;

function setupExitListener() {
    if (hasSetupExitListener)
        return;

    process.on('exit', () => {
        for (const table of liveProcessTables.list()) {
            for (const { processWrapper } of table.list()) {
                try {
                    if (processWrapper)
                        processWrapper.stop();
                } catch (e) {
                    console.error(e);
                }
            }
        }
    });

    hasSetupExitListener = true;
}

class ProcessWrapper {
    launchOptions: any
    proc: any

    restart(command: string, args: string[], options: any) {
        if (this.proc)
            this.stop();

        // console.log('spawn', { command, args }, options);

        this.launchOptions = options;
        this.proc = ChildProcess.spawn(command, args, {
            cwd: options.cwd,
            stdio: 'pipe',
        });

        const printOutput = (data) => {
            const lines = outputToLines(data);

            for (let line of lines) {
                this.log(`[${options.logPrefix}] ${line}`);
            }
        }

        this.proc.stdout.on('data', printOutput);
        this.proc.stderr.on('data', printOutput);

        this.log(`[${this.launchOptions.logPrefix} started: ${command} ${args.join(' ')}]`);
    }

    log(s: string) {
        s = s.replace(ansiRegex(), '');

        if (this.launchOptions.logColor) {
            const cursor = ansi(process.stdout, {});
            cursor.hex(this.launchOptions.logColor);
            console.log(s);
            cursor.reset();
        } else {
            console.log(s);
        }
    }

    stop() {
        this.log(`[${this.launchOptions.logPrefix} stopped]`);
        this.proc.kill();
        this.proc = null;
    }
}

export function launchProcessMonitor(graph?: Graph) {
    graph = graph || getGraph();

    const processes = graph.newTable({
        name: 'processes',
        attrs: {
            name: { required: true },
            cwd: {},
            color: {},
            id: { index: true, generate: { method: 'random' }},
            shell: { required: true },
        },
        mountAs: 'processes',
    });

    processes.addChangeListener(change => {
        let existing = liveProcesses.one({ def_id: change.item.id });

        if (change.verb === 'delete') {
            if (existing)
                existing.processWrapper.stop();
            liveProcesses.delete(existing);
            return;
        }

        const parsedArgs = change.item.shell.split(' ');
        const command = parsedArgs[0];
        const args = parsedArgs.slice(1);
        const cwd = change.item.cwd;

        if (!existing) {
            existing = liveProcesses.put({
                def_id: change.item.id,
                processWrapper: new ProcessWrapper()
            });
        }

        existing.processWrapper.restart(command, args, {
            logPrefix: change.item.name,
            logColor: change.item.color,
            cwd,
        });
    });

    const liveProcesses = graph.newTable<{def_id: string, processWrapper: any}>({
        name: 'liveProcesses',
        attrs: {
            def_id: {
                index: true,
                foreignKey: {
                    table: processes,
                    foreignAttr: 'id',
                }
            }
        }
    });

    liveProcessTables.put(liveProcesses);
    setupExitListener();

    return { processes, liveProcesses }
}

export function startWithCli() {
    const graph = getGraph();
    startConsoleRepl(graph);
}

if (require.main === module) {
    startWithCli();
}

// TODO: need to close child processes on exit.
