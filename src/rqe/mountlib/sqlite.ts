
import { Item } from '../Item'
import { MountPointSpec } from '../MountPoint'
import { parseQueryTuple, parseTableDecl } from '../parser'
import { Task } from '../Step'

interface Config {
    db: any
    tableName?: string
    attrs: string
    location: string
    funcs: string[]
    debugSql?: boolean
}

class SQLiteTableState {
    hasSetupSchema = false
}

async function maybeSetupSchema(config: Config, state: SQLiteTableState, schema: Item) {
    if (state.hasSetupSchema)
        return;

    return new Promise(resolve => {
        config.db.all(`SELECT name FROM sqlite_master WHERE name='${config.tableName}'`, (found) => {
            if (found && found.length !== 0) {
                resolve(null);
                return;
            }

            const lines = [];
            for (const attr of Object.keys(schema)) {
                lines.push(`${attr} TEXT`);
            }

            const cmd = `CREATE TABLE ${config.tableName}(` +
                lines.join(',\n ') +
             ');';

            if (config.debugSql)
                console.log('sql:', cmd);

            config.db.run(cmd, () => {
                state.hasSetupSchema = true;
                resolve(null);
            });
        });
    });
}

function quote(s: any) {
    s = s + '';
    s = s.replace(/'/g, `''`);
    return `'${s}'`;
}

async function handleGet(config: Config, step: Task) {
    step.streaming();

    const whereLines = [];

    for (const [attr, value] of Object.entries(step.args())) {
        if (value !== null) {
            whereLines.push(`${attr} = ${quote(value)}`);
        }
    }

    let cmd = `SELECT * from ${config.tableName}`;

    if (whereLines.length > 0) {
        cmd += ' WHERE ' + whereLines.join(' AND ');
    }
    
    cmd += ';';

    if (config.debugSql)
        console.log('sql:', cmd);

    config.db.each(cmd, ((err, row) => {
        if (err) {
            console.log({err});
            step.putError(err);
        } else {
            step.put(row);
        }
    }), () => {
        step.done();
    });
}

async function handlePut(config: Config, schema: Item, state: SQLiteTableState, step: Task) {
    await maybeSetupSchema(config, state, schema);

    const columns = [];
    const values = [];

    const item = step.args();

    for (const [attr, value] of Object.entries(item)) {
        if (attr === 'put!')
            continue;
        if (value === null)
            continue;
        columns.push(attr);
        values.push(`${quote(value)}`);
    }

    const cmd = `INSERT INTO ${config.tableName} (${ columns.join(',') }) `+
        `VALUES (${values.join(',')});`

    if (config.debugSql)
        console.log('sql:', cmd);
    config.db.run(cmd);
}

async function handleDelete(config: Config, schema: Item, state: SQLiteTableState, step: Task) {
    await maybeSetupSchema(config, state, schema);

    const columns = [];
    const values = [];

    const item = step.args();
    const whereLines = [];

    for (const [attr, value] of Object.entries(step.args())) {
        if (value !== null) {
            whereLines.push(`${attr} = ${quote(value)}`);
        }
    }

    let cmd = `DELETE FROM ${config.tableName}`

    if (whereLines.length > 0)
        cmd += ` WHERE ${whereLines}`;

    cmd += ';';

    if (config.debugSql)
        console.log('sql:', cmd);
    config.db.run(cmd);
}

export function getSqliteTableMount(config: Config): MountPointSpec[] {
    const points: MountPointSpec[] = [];

    const state = new SQLiteTableState();

    const tableDef = parseQueryTuple(config.attrs);
    const schema = tableDef.toItemValue();
    if (!config.tableName)
        config.tableName = config.location.replace(' ', '_');

    const location = parseTableDecl(config.location);

    const funcStrs = [
        '-> ' + config.attrs,
        ...config.funcs,
    ];

    for (const funcStr of funcStrs) {
        const func = parseTableDecl(funcStr);
        let run = (step) => handleGet(config, step);

        for (const attr of Object.values(location.attrs))
            attr.requiresValue = false;

        const attrs = {
            ...location.attrs,
            ...func.attrs,
        };

        if (attrs['put!']) {
            run = (step) => handlePut(config, schema, state, step);
            attrs['put!'] = { required: true } // make sure it's not requiresValue=true
        }

        if (attrs['delete!']) {
            run = (step) => handleDelete(config, schema, state, step);
            attrs['delete!'] = { required: true } // make sure it's not requiresValue=true
        }

        const spec: MountPointSpec = {
            attrs,
            run,
        };

        points.push(spec);
        // console.log('adding func', { location, func });
    }

    return points;
}
