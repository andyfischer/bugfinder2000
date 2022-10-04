
import sqlite3 from 'sqlite3'
import { SqliteWrapper } from './rqe/utils/SqliteWrapper'
import { TestContext } from './TestContext'

const SCHEMAS = [
`
create table test_context(
    id int auto_increment primary key,
    created_at varchar(20) not null
)
`,
`
create table picked_choice(
    id int auto_increment primary key,
    created_at varchar(20) not null,
    label text not null,
    option_name text not null,
    test_context int not null,
    page_visit int,
    foreign key (test_context) references test_context(id)
    foreign key (page_visit) references page_visit(id)

)
`,
`
create table page_visit(
    id int auto_increment primary key,
    path text not null,
    created_at varchar(20) not null,
    test_context int not null,
    foreign key (test_context) references test_context(id)

)
`,
`
create table console_log(
    id int auto_increment primary key,
    created_at varchar(20) not null,
    type varchar(5) not null,
    text text not null,
    test_context int not null,
    page_visit int,
    foreign key (test_context) references test_context(id)
    foreign key (page_visit) references page_visit(id)
)
`,
`
create table page_response(
    id int auto_increment primary key,
    created_at varchar(20) not null,
    status varchar(3),
    url text not null,
    size int,
    test_context int not null,
    page_visit int,
    foreign key (test_context) references test_context(id)
    foreign key (page_visit) references page_visit(id)
)
`,
`
create table page_request(
    id int auto_increment primary key,
    created_at varchar(20) not null,
    url text not null,
    test_context int not null,
    page_visit int,
    foreign key (test_context) references test_context(id)
    foreign key (page_visit) references page_visit(id)
)
`,
`
create table page_request_finished(
    id int auto_increment primary key,
    created_at varchar(20) not null,
    url text not null,
    test_context int not null,
    page_visit int,
    foreign key (test_context) references test_context(id)
    foreign key (page_visit) references page_visit(id)
)
`,
`
create table page_request_failed(
    id int auto_increment primary key,
    created_at varchar(20) not null,
    url text not null,
    test_context int not null,
    page_visit int,
    foreign key (test_context) references test_context(id)
    foreign key (page_visit) references page_visit(id)
)
`,
`
create table page_error(
    id int auto_increment primary key,
    created_at varchar(20) not null,
    message text not null,
    test_context int not null,
    page_visit int,
    foreign key (test_context) references test_context(id)
    foreign key (page_visit) references page_visit(id)
)
`
];

function created_at() {
    return (new Date()).toISOString();
}

export class SqliteStorage {
    db: SqliteWrapper
    ctx: TestContext

    constructor(filename: string, ctx: TestContext) {
        const db = new sqlite3.Database(filename, err => {
            if (err)
                console.error('failed to create database', err);
        });

        this.db = new SqliteWrapper(db);
        this.ctx = ctx;
    }

    async prepare() {
        for (const schema of SCHEMAS) {
            await this.db.migrate(schema);
        }
    }

    async save_test_context() {
        const { lastID } = await this.db.run(`
            insert into test_context (created_at) values (?)
        `, [ created_at() ])

        return { id: lastID }
    }

    async save_page_visit(path: string) {
        const { lastID } = await this.db.run(`
            insert into page_visit (created_at, path, test_context) values (?,?,?)
        `, [ created_at(), path, this.ctx.id ])

        return { id: lastID }
    }

    save_console_log(type: string, text: string) {
        this.db.run(`
            insert into console_log (created_at, type, text, test_context, page_visit) values (?,?,?,?,?)
        `, [ created_at(), type, text, this.ctx.id, this.ctx.current_page_visit ])
    }

    save_picked_choice(label: string, option_name: string) {
        this.db.run(`
            insert into picked_choice (created_at, label, option_name, test_context, page_visit) values (?,?,?,?,?)
        `, [ created_at(), label, option_name, this.ctx.id, this.ctx.current_page_visit ])
    }

    save_page_request(url: string) {
        this.db.run(`
            insert into page_request (created_at, test_context, page_visit, url) values (?,?,?,?)
        `, [ created_at(), this.ctx.id, this.ctx.current_page_visit, url ])
    }

    save_page_request_failed(url: string) {
        this.db.run(`
            insert into page_request_failed (created_at, test_context, page_visit, url) values (?,?,?,?)
        `, [ created_at(), this.ctx.id, this.ctx.current_page_visit, url ])
    }

    save_page_request_finished(url: string) {
        this.db.run(`
            insert into page_request_finished (created_at, test_context, page_visit, url) values (?,?,?,?)
        `, [ created_at(), this.ctx.id, this.ctx.current_page_visit, url ])
    }

    save_page_response(status: any, url: string, size: number) {
        this.db.run(`
            insert into page_response (created_at, test_context, page_visit, status, url, size) values (?,?,?,?,?,?)
        `, [ created_at(), this.ctx.id, this.ctx.current_page_visit, status, url, size ])
    }

    save_page_error(message: string) {
        this.db.run(`
            insert into page_error (created_at, test_context, page_visit, message) values (?,?,?,?)
        `, [ created_at(), this.ctx.id, this.ctx.current_page_visit, message ])
    }
}
