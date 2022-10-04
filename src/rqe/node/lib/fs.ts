
import * as Fs from 'fs/promises'
import * as Path from 'path'
import { Glob } from 'glob'
import { func } from '../../globalGraph'

func('fs $filename $encoding? -> contents buffer', async function (filename, encoding, task) {

    let out: any = {};

    if (task.has('buffer'))
        out['buffer'] = await Fs.readFile(filename);

    if (task.has('contents')) {
        encoding = encoding || 'utf8'
        out['contents'] = await Fs.readFile(filename, encoding);
    }

    return out;
});

func('fs put! $filename $contents $encoding?', async (filename, contents, encoding) => {

    encoding = encoding || 'utf8';

    const dir = Path.dirname(filename);

    await Fs.mkdir(dir, { recursive: true });
    await Fs.writeFile(filename, contents, encoding);
    return { filename };
});

func('fs put! $filename $buffer', async (filename, buffer) => {

    const dir = Path.dirname(filename);

    await Fs.mkdir(dir, { recursive: true });
    await Fs.writeFile(filename, buffer);
    return { filename };
});

func('fs chmod! $filename $permissions', async (filename, permissions) => {
    await Fs.chmod(filename, permissions);
});

func('fs delete! $filename if-exists?', async (filename, task) => {
    try {
        await Fs.unlink(filename);
    } catch (e) {
        if (e.code === "ENOENT" && task.has('if-exists'))
            return;

        throw e;
    }
});

func('fs copy! $from_filename $to_filename mkdirp?', async (from_filename, to_filename, task) => {
    if (task.has('mkdirp')) {
        const dir = Path.dirname(to_filename);
        await Fs.mkdir(dir, { recursive: true });
    }

    if (from_filename === to_filename)
        throw new Error("from_filename should not equal to_filename");

    const contents = await Fs.readFile(from_filename);
    await Fs.writeFile(to_filename, contents);
});

func('fs $from_filename $to_filename -> contents_equal', async (from_filename, to_filename) => {
    try {
        const fromContents = await Fs.readFile(from_filename);
        const toContents = await Fs.readFile(to_filename);

        return { contents_equal: fromContents.equals(toContents) }
    } catch (e) {
        return { contents_equal: false }
    }
});

func('fs mkdirp! $dir', async (dir) => {
    await Fs.mkdir(dir, { recursive: true });
});

func('fs rmrf! $dir ->', async (dir) => {
    await Fs.rmdir(dir, { recursive: true });
});

func('fs $filename -> is_directory', async (filename) => {
    const stat = await Fs.lstat(filename);
    return { is_directory: stat.isDirectory() }
});

func('fs $filename -> exists', async (filename) => {
  try {
    await Fs.access(filename)
    return {exists: true}
  } catch {
    return {exists: false}
  }
});

func('fs $dir -> contents filename relative_path absolute_path', async (dir) => {

    let contents = null;
    try {
        contents = await Fs.readdir(dir);
    } catch (e) {
        throw new Error(`error trying to readdir ${dir}: ` + e);
    }

    const out = [];

    for (const relative_path of contents) {
        out.push({
            relative_path,
            absolute_path: Path.resolve(dir, relative_path),
            filename: Path.join(dir, relative_path),
        });
    }

    return out;
});

func('fs $parent_dir -> $dir', async (parent_dir, task) => {
    let contents = null;

    try {
        contents = await Fs.readdir(parent_dir);
    } catch (e) {
        throw new Error(`error trying to readdir ${parent_dir}: ` + e);
    }

    const out = [];

    for (const filename of contents) {

        const relative_path = Path.join(parent_dir, filename);

        if (await task.attr('is_directory', 'fs $filename', { filename: relative_path })) {
            task.put({
                dir: relative_path,
            });
        }
    }

    return out;
});

func('fs $glob $root_dir? -> filename absolute_path', async (glob, root_dir, task) => {
    root_dir = root_dir || '.';

    task.streaming();

    Glob(glob, { cwd: root_dir }, async (err, files) => {
        if (err) {
            task.putError(err);
            task.done();
            return;
        }

        for (const filename of files) {
            const fullPath = Path.join(root_dir, filename);

            if (!await task.attr('is_directory', 'fs $filename', { filename: fullPath })) {
                let out = { filename }
                if (task.has('absolute_path'))
                    out['absolute_path'] = Path.resolve(root_dir, fullPath);

                task.put(out);
            }
        }

        task.done();
    });
});
