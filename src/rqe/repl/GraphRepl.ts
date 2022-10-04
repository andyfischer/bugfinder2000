
import { Graph } from '../Graph'
import { ConsoleFormatter } from '../format/ConsoleFormatter'

function trimEndline(str) {
    if (str.length > 0 && str[str.length-1] === '\n')
        return str.slice(0, str.length-1);

    return str;
}

/*
class SlowResponseTimer {
    startedAt = Date.now()
    timer: any
    queryLike: QueryLike
    outputPipe: QueryStep
    hasTriggered: boolean

    constructor(queryLike: QueryLike, outputPipe: QueryStep) {
        this.queryLike = queryLike;
        this.outputPipe = outputPipe;
        this.timer = setTimeout(() => this.afterDelay(), 2000);
    }

    afterDelay() {
        this.hasTriggered = true;
        console.log(`Slow query (${this.queryLike}), still running after 2 seconds`);
        if (EnablePipeTracing) {
            console.log('Trace:')
            console.log(stringifyPipeTrace(this.outputPipe).join('\n'));
        } else {
            console.log('(run with EnablePipeTracing to see trace)');
        }
    }

    queryFinished() {
        if (this.hasTriggered) {
            console.log(`Slow query (${this.queryLike}), has finished (${(Date.now() - this.startedAt) / 1000} seconds)`);
        }
        clearTimeout(this.timer);
        this.timer = null;
    }
}
*/

export interface ReplOptions {
    prompt?: string
}

export default class GraphRepl {
    graph: Graph
    opts: ReplOptions
    formatter: ConsoleFormatter

    constructor(graph: Graph, opts: ReplOptions) {
        this.graph = graph;
        this.opts = opts;
        // this.formatter = new ConsoleFormatter(console.log);
    }

    async eval(line: string, onDone) {
        try {
            line = trimEndline(line);

            if (line === '') {
                onDone();
                return;
            }

            const output = this.graph.query(line);

            const task = this.formatter.newTask();
            output.sendTo(task.incoming);

        } catch (e) {
            console.log('Unhandled exception in GraphRepl.eval: ', e.stack || e);
        }
    }
}

/*
function stringifyPipeTrace(outputPipe: QueryStep) {
    const lines = [];
    let searchPipes: QueryStep[] = [outputPipe];

    while (searchPipes.length > 0) {
        let nextSearch = [];

        for (const search of searchPipes) {

            let line = ` * ${search.id}`

            line += search.isDone() ? ' [closed] ' : '[ open ]';

            if (search._traceLabel)
                line += ` ${search._traceLabel}`;

            for (const { input, label } of (search._tracedInputs || [])) {
                nextSearch.push(input);

                line += ` (${label} ${input.id})`
            }

            if (!search._traceLabel) {
                line += ', no pipe label: ' + search._traceStack;
            }

            lines.unshift(line);
        }

        searchPipes = nextSearch;
    }

    return lines;
}
*/
