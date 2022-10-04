
import { CreateTable, parseSql } from './parser'

interface Migration {
    isDestructive: boolean
    statements: string[]
    warnings: string[]
}

function parseCreateTable(input: CreateTable | string): CreateTable {
    if (typeof input === 'string') {
        const parsed = parseSql(input);
        if (parsed.t !== 'create_table')
            throw new Error("expected a 'create table' statement");

        return parsed;
    }

    return input;
}

export function getGeneratedMigration(fromTableLoose: CreateTable | string, toTableLoose: CreateTable | string): Migration {
    const needToInsert = [];
    const needToDelete = [];
    const needToModify = [];
    const warnings: string[] = [];

    const fromTable = parseCreateTable(fromTableLoose);
    const toTable = parseCreateTable(toTableLoose);

    function findColumn(table: CreateTable, name: string) {
        for (const column of table.columns)
            if (column.name === name)
                return column;
        return null;
    }

    for (const fromColumn of fromTable.columns) {
        const toColumn = findColumn(toTable, fromColumn.name);

        if (!toColumn) {
            needToDelete.push(fromColumn);
            continue;
        }

        if (fromColumn.definition !== toColumn.definition) {

            if (fromColumn.definition.replace('not null', '').trim() ===
                toColumn.definition.replace('not null', '').trim()) {
                warnings.push("can't add/remove a 'not null' constraint");
                continue;
            }

            // needToModify.push(toColumn);
            throw new Error(`not yet supported: column modification (${toColumn.name} from "${fromColumn.definition}" to "${toColumn.definition}")`);
            continue;
        }
    }

    for (const toColumn of toTable.columns) {
        const fromColumn = findColumn(fromTable, toColumn.name);
        if (!fromColumn)
            needToInsert.push(toColumn);
    }

    const statements: string[] = [];
    let isDestructive = false;

    for (const column of needToInsert) {
        let def = column.definition;
        if (def.toLowerCase().indexOf("not null") !== -1) {
            warnings.push("Can't have 'not null' on new column: " + column.name);
            def = def.replace(/not null ?/i, '');
        }
        statements.push(`alter table ${fromTable.name} add column ${column.name} ${def};`);
    }

    for (const column of needToDelete) {
        isDestructive = true;
        statements.push(`alter table ${fromTable.name} drop column ${column.name};`);
    }

    return {
        isDestructive,
        statements,
        warnings,
    };
}
