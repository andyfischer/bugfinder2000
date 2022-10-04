
import { Graph } from '../Graph'

interface BlockInput {
    t: 'block_input'
    name: string
}

interface ValueInput {
    t: 'value'
    value: any
}

interface LocalInput {
    t: 'local_input'
    id: number
}

interface NameReference {
    t: 'name_ref'
    name: string
}

interface ParseError {
    message: string
    pos: number
}

interface Import {
    id?: number
    start_pos: number
    end_pos: number
}

interface Export {
    id?: number
    start_pos: number
    end_pos: number
}

interface VariableStatement {
    id?: number
    start_pos: number
    end_pos: number
    name: string
}

interface Call {
    id?: number
    start_pos: number
    end_pos: number
    function_name: string
    statement_id: number
}

interface CallArg {
    id?: number
    start_pos: number
    end_pos: number
    function_call_id: number
}

export interface Block {
    id?: number
    parent_block_id: number
    parent_statement_id: number
    start_pos: number
    end_pos: number
    statements_start_pos: number
    statements_end_pos: number
    has_modified?: boolean
}

interface Statement {
    id?: number
    start_pos: number
    end_pos: number
    block_id?: number
    has_modified?: boolean
    replacement_text?: string
}

interface FunctionDecl {
    id?: number
    function_name: string
    start_pos: number
    end_pos: number
    has_modified?: boolean
}

export class ProgramGraph {
    graph = new Graph()

    blocks = this.graph.newTable<Block>({
        name: 'blocks',
        attrs: {
            id: { generate: { method: 'increment' }},
            parent_statement_id: {},
        },
        funcs: [
            'parent_statement_id ->'
        ]
    });
    
    statements = this.graph.newTable<Statement>({
        name: 'statements',
        attrs: {
            id: { generate: { method: 'increment' }},
            block_id: {},
        },
        funcs: [
            'block_id ->'
        ]
    });

    imports = this.graph.newTable<Import>({
        name: 'imports',
        attrs: {
            id: { generate: { method: 'increment' }},
            start_pos: {},
            end_pos: {},
        }
    });

    exports = this.graph.newTable<Export>({
        name: 'exports',
        attrs: {
            id: { generate: { method: 'increment' }},
            start_pos: {},
            end_pos: {},
            variable_statement: {},
        },
        funcs: [
            'id ->',
        ]
    });

    variable_statements = this.graph.newTable<VariableStatement>({
        name: 'variable_statements',
        attrs: {
            id: { generate: { method: 'increment' }},
            start_pos: {},
            end_pos: {},
            name: {},
        },
        funcs: [
            'id ->',
        ]
    });

    calls = this.graph.newTable<Call>({
        name: 'calls',
        attrs: {
            id: { generate: { method: 'increment' }},
            function_name: {},
            start_pos: {},
            end_pos: {},
        },
        funcs: [
            "function_name ->"
        ]
    });

    call_args = this.graph.newTable<CallArg>({
        name: 'call_args',
        attrs: {
            id: { generate: { method: 'increment' }},
            start_pos: {},
            end_pos: {},
            function_call_id: {},
        },
        funcs: [
            'function_call_id ->'
        ]
    });

    function_decls = this.graph.newTable<FunctionDecl>({
        name: 'function_decls',
        attrs: {
            id: { generate: { method: 'increment' }},
            function_name: {},
            statement_id: {},
        },
        funcs: [
            'statement_id ->'
        ]
    });

    function_decl_args = this.graph.newTable({
        name: 'function_decl_args',
        attrs: {
            id: { generate: { method: 'increment' }},
            function_decl_id: {},
        },
        funcs: [
            "function_decl_id ->"
        ]
    });

    errors = this.graph.newTable<ParseError>({
        name: 'errors',
        attrs: {
            message: {},
            pos: {},
        }
    });

    string_literal = this.graph.newTable<ParseError>({
        name: 'string_literal',
        attrs: {
            id: { generate: { method: 'increment' }},
            pos: {},
        }
    });
}
