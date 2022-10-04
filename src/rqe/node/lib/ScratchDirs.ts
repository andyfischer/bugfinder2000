
import { func } from '../../globalGraph'
import * as path from 'path'
import './fs'

import { findRootDir } from './OptionalNodeInstall'

func('$scratch_dir create! -> dir', async function (scratch_dir, task) {

    const scratchRoot = path.join(await findRootDir(process.cwd()), '.scratch');
    const dir = path.join(scratchRoot, scratch_dir);

    await task.query('fs mkdirp! $dir', { dir: scratchRoot });
    await task.query('fs mkdirp! $dir', { dir: dir });

    return { dir }
});
