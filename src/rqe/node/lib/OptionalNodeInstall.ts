
import * as fs from 'fs/promises';
import * as path from 'path'
import { func, query } from '../../globalGraph'
import { Task } from '../../Step'

import './shell'

export async function findRootDir(searchDir: string) {
    const contents = await fs.readdir(searchDir);
    for (const file of contents) {
        if (file === "package.json")
            return searchDir;
    }

    const parent = path.dirname(searchDir);
    if (parent === searchDir)
        return null;

    if (parent === '/')
        return null;

    return findRootDir(parent);
}

async function exists(filename: string) {
    return fs.access(filename).then(() => true).catch(() => false);
}

async function getOptionalNodeDependency(step: Task, name: string, version?: string) {
    const rootDir = await findRootDir(process.cwd());

    // check node_modules
    const inNodeModules = path.join(rootDir, 'node_modules', name);
    if (await exists(inNodeModules)) {
        return require(inNodeModules);
    }

    const optionalDir = path.join(rootDir, '.optional');

    // check .optional
    const inOptional = path.join(optionalDir, 'node_modules', name);
    if (await exists(inOptional)) {
        return require(inOptional);
    }

    // need to download it
    if (!await exists(optionalDir)) {
        await fs.mkdir(optionalDir);
    }

    if (!await exists(path.join(optionalDir, "package.json"))) {
        await fs.writeFile(path.join(optionalDir, "package.json"), "{}");
    }

    // install
    console.log('installing optional dependency: ' + name);

    let installCmd = 'yarn add ' + name;
    if (version)
        installCmd += '@' + version;

    const result = await step.query('shell $cmd $cwd stdout stderr', { cmd: installCmd, cwd: optionalDir });

    return require(inOptional);
}

func('node get_optional_dependency $name $version? -> package', async (name, version, task) => {
    const _package = await getOptionalNodeDependency(task, name, version);
    return { 'package': _package }
});

func('node clear_optional_dependencies!', async (task) => {
    const rootDir = await findRootDir(process.cwd());
    const optionalDir = path.join(rootDir, '.optional');

    await task.query('fs rmrf! $dir', { dir: optionalDir });
});

async function main() {
    // console.log('yargs', (await query('node get_optional_dependency name=yargs package')).columnList('package'));
    console.log('keccak256', (await query('node get_optional_dependency name=keccak256 package')).columnList('package'));
}

if (require.main === module) {
    main();
}
