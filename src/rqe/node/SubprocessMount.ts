
import { Graph } from '../Graph'
import { Module } from '../Module'
import { MountPointSpec } from '../MountPoint'
import { Task } from '../Step'
import { IDSourceNumber as IDSource } from '../utils/IDSource'
import { Stream, StreamEvent } from '../Stream'
import { Query } from '../Query'
import { newTable, func } from '../globalGraph'
import { spawn } from './ChildProcess'

export interface ShellCommand {
    cmd: string
    args: string[]
    options: {
        cwd?: string
    }
}

export interface UpdateModule {
    t: 'updateModule'
    id: number
    pointSpecs: MountPointSpec[]
}

export interface OutputData {
    t: 'output'
    streamId: number
    msg: StreamEvent
}

export type MessageFromSubprocess = UpdateModule | OutputData

export interface QueryRequest {
    t: 'query'
    query: Query
    input: number
    output: number
}

export type MessageToSubprocess = QueryRequest

const subprocess_mounts = newTable<{ subprocess_id?: string, subprocess: SubprocessMount }>({
    attrs: {
        subprocess_id: { generate: { method: 'increment', prefix: 'subprocess-' }},
        subprocess: {},
    }
});

func("$subprocess restart!", (subprocess: SubprocessMount) => {
    subprocess.restart();
});

func("$subprocess kill!", (subprocess: SubprocessMount) => {
    subprocess.kill();
});

export class SubprocessMount {
    graph: Graph
    command: ShellCommand
    proc: any
    streamIds = new IDSource()
    modules = new Map<number, Module>()
    outputStreams = new Map<number, Stream>()
    subprocess_id: string
    provider_id: string

    constructor(graph: Graph, command: ShellCommand) {
        this.graph = graph;
        this.command = command;

        const { subprocess_id } = subprocess_mounts.put({ subprocess: this });
        this.subprocess_id = subprocess_id;
    }

    start() {
        if (this.proc)
            throw new Error("already have .proc");

        const proc = spawn(this.graph, this.command.cmd, this.command.args, {
            ...this.command.options,
            env: {
                ...process.env,
                RQE_SUBPROCESS: 'true',
            },
            stdio: ['pipe','pipe','pipe','ipc'],
        });

        proc.stdout.on('data', msg => {
            msg = msg.toString();
            if (msg.endsWith('\n'))
                msg = msg.substring(0, msg.length - 1);
            console.log(`[subprocess] ` + msg);
        });

        proc.stderr.on('data', msg => {
            msg = msg.toString();
            if (msg.endsWith('\n'))
                msg = msg.substring(0, msg.length - 1);
            console.error(`[subprocess] ` + msg);
        });

        proc.on('message', msg => {
            if (typeof msg === 'string')
                msg = JSON.parse(msg);
            this.handle(msg as MessageFromSubprocess);
        });

        proc.on('exit', () => {
            console.log(`process has exited: ${this.command.cmd} ${this.command.args}`);
            this.closeEverything();
        });

        // - wait for mount spec from child process
        // - use it redefine the module
        //
        // new class for the subprocess to declare its provided mounts

        this.proc = proc;

        const { provider_id } = this.graph.providers().put({
            runQuery: (query,input) => this.runQueryInSubprocess(query,input),
        });

        this.provider_id = provider_id;
    }

    kill() {
        this.closeEverything();
        if (this.proc)
            this.proc.kill();

        this.graph.providers().delete({ provider_id: this.provider_id });
        this.proc = null;
        this.provider_id = null;
    }

    restart() {
        this.kill();
        this.start();
    }

    connectInputStream(input: Stream) {
        return null;
    }

    connectOutputStream() {
        const outputStream = new Stream();
        const outputStreamId = this.streamIds.take();
        this.outputStreams.set(outputStreamId, outputStream);
        return { outputStream, outputStreamId };
    }

    runQueryInSubprocess(query: Query, input: Stream): Stream {
        const { outputStream, outputStreamId } = this.connectOutputStream();

        this.proc.send({
            t: 'query',
            query,
            input: this.connectInputStream(input),
            output: outputStreamId,
        } as QueryRequest);

        return outputStream;
    }

    handle(msg: MessageFromSubprocess) {
        console.log('handle message from subprocess', msg);
        switch (msg.t) {
        case 'updateModule': {
            const { pointSpecs, id } = msg;

            if (!this.modules.has(id))
                this.modules.set(id, this.graph.createEmptyModule());

            const module = this.modules.get(id);

            // Recreate all the 'run' callbacks.
            for (const spec of pointSpecs) {
                spec.providerId = this.provider_id;
                spec.run = (step: Task) => {

                    step.async();

                    const outputStream = this.runQueryInSubprocess(new Query([
                        step.tuple
                    ]), step.input);

                    outputStream.sendTo(step.output);
                }
            }

            module.redefine(pointSpecs);
            
            break;
        }

        case 'output': {
            const stream = this.outputStreams.get(msg.streamId);
            stream.receive(msg.msg);
            break;
        }

        default:
            console.warn('unrecognized message from subprocess: ', (msg as any).t);
        }
    }

    closeEverything() {
        for (const module of this.modules.values()) {
            module.clear();
        }

        for (const stream of this.outputStreams.values()) {
            stream.sendDoneIfNeeded();
        }

        this.outputStreams.clear();
    }
}

export function toShellCommand(s: string) {
    const args = s.split(' ');
    return {
        cmd: args[0],
        args: args.slice(1),
        options: {},
    }
}

export function setupSubprocessTable(graph: Graph) {
    const loadSubprocess = graph.newTable({
        attrs: {
            id: { generate: { method: 'increment' } },
            load_subprocess: {},
            cmd: {},
        },
        funcs: [
            'load_subprocess $cmd ->'
        ]
    });

    const loadToSubprocess = graph.newTable({
        attrs: {
            load_id: {},
            subprocess_id: {},
        },
        funcs: [
            '$load_id ->',
            '$subprocess_id ->',
        ]
    });

    loadSubprocess.addChangeListener(change => {
        console.log(change);
        if (change.verb === 'put') {
            const { id, cmd } = change.item;
            const fullCommand = toShellCommand(cmd)
            console.log('starting subprocess', fullCommand);
            const mount = new SubprocessMount(graph, fullCommand);
            mount.start();
            loadToSubprocess.put({ load_id: id, subprocess_id: mount.subprocess_id });
        } else if (change.verb === 'delete') {
            const { id } = change.item;
            const { subprocess_id } = loadToSubprocess.one({ load_id: id });
            const { subprocess } = subprocess_mounts.one({ subprocess_mounts });
            subprocess.kill();
        }
    });
}
