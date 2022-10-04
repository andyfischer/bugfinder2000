
import { Failure } from './FailureTracking'
import { Table } from './Table'
import { TableSchema } from './Schema'
interface TestCase {} // stub from importRqeSrc

type Name = 'failures' | 'test_case' | 'alt_impl' | 'func_cache' | 'listener_close_signal'
    | 'resource_tag_to_close_signal'
    | 'cache_v2'

class LazyTable<T> {
    schema: TableSchema
    table: Table<T>

    constructor(schema: TableSchema) {
        this.schema = schema;
    }

    get() {
        if (!this.table) {
            this.table = new Table<T>(this.schema)
        }
        return this.table;
    }
}

const _definitions: { [name in Name] : { create: () => Table } } = {
    failures: {
        create() {
            return new Table({
                attrs: {
                    message: {},
                    check_attrs: {},
                }
            });
        }
    },
    test_case: {
        create() {
            return new Table({
                attrs: 'id(generated) description enabled',
                funcs: [
                    '$enabled ->'
                ]
            });
        }
    },
    alt_impl: {
        create() {
            return new Table({
                attrs: {
                    name: {},
                    enabled: {},
                },
                funcs: [
                    '$name ->'
                ]
            });
        }
    },
    func_cache: {
        create() {
            return new Table({
                attrs: {
                    func: {},
                    input_tuple: {},
                    output_stream: {},
                    cached_at: {},
                },
                funcs: [
                    'func ->',
                    'func input_tuple ->',
                    'input_tuple ->',
                ]
            });
        }
    },
    cache_v2: {
        create() {
            return new Table({
                attrs: {
                    func_decl: {},
                    input_tuple: {},
                    in_progress_stream: {},
                    finished_events: {},
                    cached_at: {},
                    expire_at: {},
                },
                indexes: [{
                    attrs: ['func_decl', 'input_tuple'],
                    unique: {
                        onConflict: 'overwrite'
                    }
                }],
                funcs: [
                    'func_decl ->',
                    'func_decl input_tuple ->',
                    'input_tuple ->',
                ]
            });
        }
    },
    listener_close_signal: {
        create() {
            return new Table({
                attrs: {
                    listen_stream_id: {},
                    listener_id: {},
                    close_callback: {},
                },
                funcs: [
                    'listener_id ->',
                    'listen_stream_id ->',
                ]
            })
        }
    },
    resource_tag_to_close_signal: {
        create() {
            return new Table({
                attrs: {
                    listen_stream_id: {},
                    resource_tag: {},
                    close_callback: {},
                },
                funcs: [
                    'listener_id ->',
                    'listen_stream_id ->',
                ]
            })
        }
    },
}

export class BuiltinTables {
    map = new Map<Name, Table>();

    get(name: Name) {
        if (!this.map.has(name))
            this.map.set(name, _definitions[name].create());

        return this.map.get(name);
    }

    has(name: Name) {
        return this.map.has(name);
    }

    failures(): Table<Failure> {
        return this.get('failures');
    }

    testCases(): Table<TestCase> {
        return this.get('test_case');
    }

    altImpl(): Table<{name: string, enabled: boolean}> {
        return this.get('alt_impl');
    }

    funcCache(): Table<any> {
        return this.get('func_cache');
    }

    listener_close_signal(): Table<any> {
        return this.get('listener_close_signal');
    }

    resource_tag_to_close_signal(): Table<any> {
        return this.get('resource_tag_to_close_signal');
    }
}
