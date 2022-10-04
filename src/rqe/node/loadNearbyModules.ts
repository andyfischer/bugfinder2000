
import * as Glob from 'glob'
import * as Path from 'path'
import * as Fs from 'fs'

import { Graph } from '../Graph'
import { requireAndWatch } from './requireAndWatch'
import { EnableTsModules } from './Configs'
import * as kdl from 'kdljs'

if (EnableTsModules) {
    try {
        require('ts-node').register({});
    } catch (e) {
    }
}

let _moduleLogs = [];

function log(msg: string) {
    console.log(msg);
    _moduleLogs.push(msg);
}

function findNearbyPatternsFromConfig() {
    const nearbyPatterns = [];

    let contents;

    try {
        contents = Fs.readFileSync(".rqe.kdl", "utf8");
    } catch (err) {
        return;
    }

    const parsed = kdl.parse(contents);

    for (const node of parsed.output) {
        if (node.name === 'load') {
            for (const loadNode of node.children) {
                if (loadNode.name === 'pattern') {
                    for (const value of loadNode.values)
                        nearbyPatterns.push(value);
                }
            }
        }
    }

    return nearbyPatterns;
}

function defaultNearbyPatterns() {
    const nearbyPatterns = [
        'dist/node/tables/**/*.js',
        'dist/**/*.table.js',
        '*.table.js',
        'tables.js',
        '.tables.js',
        '.rqe.js',
        'dist/tables.js',
        '.rqe/**/*.js',
    ];

    if (EnableTsModules) {
        nearbyPatterns.push('tables.ts');
        nearbyPatterns.push('src/tables.ts');
        nearbyPatterns.push('.tables.ts');
        nearbyPatterns.push('*.table.ts');
        nearbyPatterns.push('.rqe.ts');
        nearbyPatterns.push('.rqe/**/*.ts');
    }

    return nearbyPatterns;
}

function loadDirectory(graph: Graph, dir: string, dirNote?: string) {

    const nearbyPatterns = findNearbyPatternsFromConfig() || defaultNearbyPatterns();

    let files = [];
    for (const pattern of nearbyPatterns) {
        files = files.concat(Glob.sync(Path.join(dir, pattern), {
            ignore: ['**/node_modules/**']
        }))
    }

    for (const filename of files) {
        if (filename.indexOf("__tests__") !== -1)
            continue;

        let note = dirNote || `part of directory ${dir}`
        log(`loading file (${note}): ${filename}`);
        requireAndWatch(graph, filename);
    }
}

export function loadFromCurrentDirectory(graph: Graph) {

    loadDirectory(graph, ".", "found in cwd");
}

function loadUserSetupJson() {
    if (!process.env.HOME)
        return {};

    const localSetupPath = Path.join(process.env.HOME, ".rqe/local_setup.json");
    if (Fs.existsSync(localSetupPath)) {
        // log('found user setup file: ' + localSetupPath);
        return JSON.parse(Fs.readFileSync(localSetupPath, 'utf8'));
    }
    return {};
}

export function loadFromUserSetupDirectories(graph: Graph) {

    const data = loadUserSetupJson();
    const dirs = data.load_directories || [];

    for (const dir of dirs) {
        // log('loading dir (from ~/.rqe/local_setup.json): ' + dir);
        loadDirectory(graph, dir);
    }
}
