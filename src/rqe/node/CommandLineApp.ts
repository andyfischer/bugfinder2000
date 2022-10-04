
import * as Fs from 'fs'
import * as kdl from 'kdljs'
import { Graph } from '../Graph'
import { startConsoleRepl, ReplOptions } from './consoleRepl'
import { requireAndWatch } from './requireAndWatch'
import { loadFromCurrentDirectory, loadFromUserSetupDirectories } from './loadNearbyModules'
import { runSetupFromModule } from './loadNodeModule'
import { SubprocessMount, ShellCommand, toShellCommand, setupSubprocessTable } from './SubprocessMount'
import { getGraph } from '../globalGraph'
import { overrideProcessExit } from './ProcessExit'
import { parseCommandLineArgs, ParsedCommandLineArgs } from './parseCommandLineArgs'
import { ConsoleFormatter } from '../format/ConsoleFormatter'
import { QueryLike } from '../Query'
import '../tools/common/InterceptConsoleLog'

export { startConsoleRepl } from './consoleRepl'

interface StartOptions {
    // Called while setting up the graph
    setupGraph?(graph: Graph): void

    // Called once setup is done
    onReady?(graph: Graph): void | Promise<void>
    runWhenReady?: QueryLike[]

    loadFiles?: string[]
    loadModules?: any[]
    loadFromCurrentDirectory?: boolean
    loadUserSetupDirectory?: boolean
    loadSubprocesses?: ShellCommand[]
    startRepl?: boolean | ReplOptions // API suggestion- maybe remove this, caller can use startConsoleRepl?
    terminal?: {
        title?: string
    }
    runFromStdin?: boolean
    standardCommandLineArgHandling?: boolean
    enableLoggingCategories?: string[]
}

function runFile(graph: Graph, filename: string) {
    const contents = Fs.readFileSync(filename, 'utf8');
    throw new Error("parseFile not implemented");
}

/*
  Initialize the process global graph for a command-line application.

  This includes:
    - Adding standard tables (reading filesystem and etc)
    - Launching subprocesses (if configured)
*/

export function setupCliGraph(options: StartOptions) {
    const graph = getGraph();

    require('./lib/fs');
    require('./lib/buffer');
    require('./lib/git');
    require('./lib/shell');
    require('./lib/OptionalNodeInstall');
    require('./lib/ScratchDirs');

    graph.enableLogging();
    for (const category of options.enableLoggingCategories || [])
        graph.logging.enable(category);

    graph.setupBrowse();

    if (options.loadFromCurrentDirectory)
        loadFromCurrentDirectory(graph);

    if (options.loadUserSetupDirectory)
        loadFromUserSetupDirectories(graph);

    if (options.setupGraph)
        options.setupGraph(graph);

    for (const filename of (options.loadFiles || [])) {
        requireAndWatch(graph, filename);
    }
    
    for (const module of (options.loadModules || [])) {
        runSetupFromModule(graph, module);
    }

    setupSubprocessTable(graph);
    for (const subprocessCommand of (options.loadSubprocesses || [])) {
        const subprocess = new SubprocessMount(graph, subprocessCommand);
        subprocess.start();
    }

    return graph;
}

function maybeLoadConfigFile(filename: string) {
    let contents;

    try {
        contents = Fs.readFileSync(filename, "utf8");
    } catch (err) {
        return null;
    }

    const parsed = kdl.parse(contents);
    if (parsed.errors.length > 0)
        throw new Error("config parsing error: " + parsed.errors);

    return parsed.output;
}

function loadNearbyConfigFile(options: StartOptions) {
    const configs = maybeLoadConfigFile('.rqe.kdl');
    if (!configs)
        return null;

    for (const node of configs) {
        if (node.name === 'load') {
            for (const loadNode of node.children) {
                if (loadNode.name === 'subprocess') {
                    options.loadSubprocesses = options.loadSubprocesses || []

                    const command = loadNode.values[0] as string;
                    const cmd = command.split(' ')[0];
                    const args = command.split(' ').slice(1);

                    // console.log({cmd,args})

                    options.loadSubprocesses.push({
                        cmd,
                        args,
                        options: {}
                    });
                }
            }
        }
    }
}

/*
 Start running this process as a command-line application.

 This does various process-wide things like:

   - Read command line options from process.argv.
   - Override process.exit for graceful shutdown.
*/

function optionsWithCommandLine(options: StartOptions, args: ParsedCommandLineArgs) {
    for (const flag of args.flags){
        if (flag.name === 'subprocess') {
            options.loadSubprocesses = options.loadSubprocesses || [];
            options.loadSubprocesses.push(toShellCommand(flag.value));
        }

        if (flag.name === 'enable-logging') {
            options.enableLoggingCategories = options.enableLoggingCategories || [];
            options.enableLoggingCategories.push(flag.value);
        }

        if (flag.name === 'stdin') {
            options.runFromStdin = true;
        }
    }

    return options;
}

function optionsWithDefaults(options: StartOptions) {
    if (options.runFromStdin && options.startRepl === undefined)
        options.startRepl = false;

    if (options.startRepl === undefined)
        options.startRepl = true;

    return options;
}

function runFromStdin(graph: Graph) {
    const formatter = new ConsoleFormatter({ graph });

    process.stdin.on('data', chunk => {
        let query = chunk.toString();
        if (query[query.length -1] === '\n')
            query = query.slice(0, query.length - 1);

        graph.query(query).sendTo(formatter.newTask().incoming);
    });
}

function setTerminalTitle(title)
{
  process.stdout.write(
    String.fromCharCode(27) + "]0;" + title + String.fromCharCode(7)
  );
}

export async function runCommandLineProcess(options: StartOptions = {}) {

    require('source-map-support').install();

    try {
        overrideProcessExit();

        // console.log('process.argv = ', process.argv);
        const parsedArgs = parseCommandLineArgs(process.argv.slice(2).join(' '));
        options = optionsWithCommandLine(options, parsedArgs);
        options = optionsWithDefaults(options);

        const graph = setupCliGraph(options);

        if (options.terminal?.title) {
            setTerminalTitle(options.terminal.title);
        }

        if (options.onReady) {
            await options.onReady(graph);
        }

        if (options.runWhenReady) {
            const formatter = new ConsoleFormatter({ graph });

            for (const query of options.runWhenReady) {
                graph.query(query).sendTo(formatter.newTask().incoming);
            }
        }

        if (options.startRepl) {
            const replOptions = (options.startRepl && typeof options.startRepl === 'object') ? options.startRepl : {};
            startConsoleRepl(graph, replOptions);
        }

        if (options.runFromStdin) {
            runFromStdin(graph);
        }

        return graph;
    } catch (err) {
        process.exitCode = -1;
        console.error(err.stack || err);
    }
}

if (require.main === module) {
    runCommandLineProcess({
        standardCommandLineArgHandling: false
    });
}
