
import * as Path from 'path'
import * as Fs from 'fs'
import * as Glob from 'glob'
import { Graph } from '../Graph'
import Debounce from '../utils/Debounce'
import { getSetupFromModule } from './loadNodeModule'

const loadedModules = new Map<string, any>();

export function requireAndWatch(graph: Graph, filename: string) {

    filename = Path.resolve(filename);

    if (loadedModules.has(filename)) {
        return;
    }

    const module = graph.createEmptyModule();
    let lastMtime;

    function reloadNow() {
        const mtime = Fs.statSync(filename).mtime.valueOf();

        if (mtime === lastMtime)
            return;

        lastMtime = mtime;

        const resolvedFilename = require.resolve(filename);
        const existingModule = require.cache[resolvedFilename];
        delete require.cache[resolvedFilename];

        try {
            const contents = require(filename);
            const setup = getSetupFromModule(contents);
            module.redefine(setup);

            if (existingModule) {
                console.log(`reloaded: ${filename}`);
            }

        } catch (err) {
            console.log(`Failed to load module: ${filename}\n${err.stack || err}`);

            // Rollback to previous module
            require.cache[resolvedFilename] = existingModule;
        }
    }

    loadedModules.set(filename, true);

    reloadNow();

    const reload = new Debounce(reloadNow, 250);
    Fs.watch(filename, () => reload.post());
}

export function loadWatchedTableDir(graph: Graph, dir: string) {
    const files = Glob.sync(Path.join(dir, '**/*.js'));
    for (const file of files)
        requireAndWatch(graph, file);
}

export function loadWatchedTableGlob(graph: Graph, pattern) {
    const files = Glob.sync(pattern);
    for (const file of files)
        requireAndWatch(graph, file);
}
