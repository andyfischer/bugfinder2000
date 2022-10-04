
import { openAsyncIterator } from './openAsyncIterator'
import { parseSql } from '../ast/sql/parser'
import { getGeneratedMigration } from '../ast/sql/migration'

type Params = string | Array<any> | Object

export class SqliteWrapper {
    db: any

    constructor(db: any) {
        if (!db)
            throw new Error("missing: db");
        this.db = db;
    }

    run(sql: string, params?: Params): Promise<{ changes: Array<any>, lastID: any }> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) {
                    reject(err);
                    return;
                }

                let changes = this.changes;
                let lastID = this.lastID;
                resolve({changes, lastID});
            });
        });
    }

    get(sql: string, params?: Params): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err)
                    reject(err);
                else
                    resolve(row);
            });
        });
    }

    async* each(sql: string, params?: Params) {
        const { send, done, iterator } = openAsyncIterator();

        this.db.each(sql, params, function (err, row) {
            if (err)
                throw err;

            send(row);
        }, done);

        yield* iterator;
    }

    all(sql: string, params?: Params): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, function (err, rows) {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(rows);
            });
        });
    }

    allExtended(sql: string, params?: Params): Promise<{rows: any[], changes: any[], lastID: string | number }> {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, function (err, rows) {
                if (err) {
                    reject(err);
                    return;
                }

                let changes = this.changes;
                let lastID = this.lastID;
                resolve({changes, rows, lastID});
            });
        });
    }

    async migrate(sql: string) {
        const statement = parseSql(sql);
        if (statement.t == 'create_table') {
            const existingTable: any = await this.get(`select sql from sqlite_schema where name = ?`, statement.name);
            
            if (!existingTable) {
                // Table doesn't exist yet, create it.
                await this.run(sql);
                return;
            }

            const migration = getGeneratedMigration(existingTable.sql, statement);

            for (const migrationStatement of migration.statements)
                await this.run(migrationStatement);

            for (const warning of migration.warnings)
                console.warn(`table ${statement.name} had migration warning: ${warning}`);

        } else {
            throw new Error("Unsupported statement in migrate(). Only supporting 'create table' right now");
        }
    }
}
