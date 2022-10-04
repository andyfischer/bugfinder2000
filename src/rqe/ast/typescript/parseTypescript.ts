
import { tokenizeString } from '../../lexer/tokenizeString'
import { TokenIterator, LexedText } from '../../lexer'
import { ParsedProgram } from '../ParsedProgram'
import { t_newline, t_lbrace, t_rbrace, t_lbracket, t_rbracket, t_star, t_lparen, t_rparen,
    t_colon, t_lthan, t_gthan, t_line_comment, t_right_fat_arrow,
    t_equals, t_plain_value, t_semicolon, t_dot, t_comma,
    t_quoted_string, t_plus, t_dash, t_slash, t_ident } from '../../lexer/tokens'

class Context extends TokenIterator {
    program: ParsedProgram
    isLookingAhead: boolean
    current_statement: number = 0;
    current_block_id: number = 0;
    current_function_decl: number = 0;
    current_function_call: number = 0;

    constructor(text: LexedText) {
        super(text, {
            autoSkipSpaces: true,
            cStyleLineComments: true
        })

        this.program = new ParsedProgram(text);
    }
}

interface StepOptions {
    store?: string
}

const functionModifiers = {
    export: true,
    async: true,
};

function captureError(it: Context, message: string, stepName: string) {
    const pos = it.getPosition();
    const token = it.next();

    if (token) {
        it.program.errors.put({
            message: `error parsing ${stepName} [line ${token?.lineStart} col ${token?.columnStart}] ${message} `
                       +`(next token = ${token?.match?.name}, text = "${it.sourceText.getTokenText(token)}")`,
            pos
        });
    } else {
        it.program.errors.put({
            message: `error parsing ${stepName} [end of file] ${message} `,
            pos,
        });
    }
}

function step(name: string, opts: StepOptions, callback: (it: Context, item?: any) => false | true | void | 'no_match') {

    return (it: Context) => {
        const start_pos = it.getPosition();

        let item = null;
        let table = null;

        try {
            if (opts.store) {
                table = it.program[opts.store];
                if (!table)
                    throw new Error("program doesn't have table: " + opts.store);
                item = table.put({ start_pos });
            }
            
            const result = callback(it, item);

            if (result === false || result === 'no_match') {
                // match failed
                if (item)
                    table.delete(item);

                it.restore(start_pos);
                if (table)
                    table.delete({id:item.id});

                return false;
            } else {
                item = item || {};
            }

            const end_pos = it.getPosition();

            if (item)
                item.end_pos = end_pos;

            if (start_pos === end_pos) {
                captureError(it, "internal error: token position didn't change after step", name);
                it.advance();
            }


        } catch (err) {

            const token = it.next();

            if (item)
                table.delete({id:item.id});

            // console.log(`parseTypescript [line ${token.lineStart} col ${token.columnStart}] unhandled error in ${name}`, err.stack)
            captureError(it, err.message, name);

            const end_pos = it.getPosition();
            if (start_pos === end_pos)
                it.advance();

            item = item || {};
        }

        return item;
    }
}

const ImportStatement = step('import', {store:'imports'}, (it: Context) => {
    const start_pos = it.getPosition();

    it.consume();

    const startImports = it.getPosition();

    if (it.tryConsume(t_lbrace)) {
        it.consumeWhile(next => next.match !== t_rbrace);
        it.tryConsume(t_rbrace);
    } else {
        it.consume();
    }

    const endImports = it.getPosition();

    let filename;

    if (it.nextText() === "from") {
        it.consume();
        filename = it.consumeAsUnquotedText();
    }
});

const Export = step('export', {store:'exports'}, (it: Context, item) => {
    if (it.nextText() === "export")
        it.consume();

    if (it.nextText() === "const" || it.nextText() === "let" || it.nextText() === "var") {
        const statement = VariableStatement(it);
        item.variable_statement = statement.id;
    }

    if (it.nextText() === "type")
        return TypeDecl(it);

    if (it.nextText() === "interface")
        return InterfaceDecl(it);
});

const FunctionDeclArg = step('function_decl_arg', {store: 'function_decl_args'}, (it: Context, data) => {
    const match = it.tryConsume(t_ident) || it.tryConsume(t_plain_value);
    if (!match) {
        return false;
    }

    data.function_decl_id = it.current_function_decl;

    if (it.tryConsume(t_colon))
        TypeAnnotation(it);

    if (it.tryConsume(t_equals))
        Expression(it);

    return true;
});

const FunctionDeclArgs = step('function_args', {}, (it: Context, data) => {

    if (!it.tryConsume(t_lparen)) {
        return false;
    }

    while (!it.finished()) {
        it.skipNewlines();

        if (it.tryConsume(t_rparen))
            return true;

        if (!FunctionDeclArg(it)) {
            return false;
        }

        if (it.tryConsume(t_rparen))
            return true;

        it.skipNewlines();
        it.consume(t_comma);
    }

    return false;
});

const ArrowFunctionDecl = step('arrow_function_decl', {store:'function_decls'}, (it: Context, data) => {

    if (it.nextText() === 'async')
        it.consume();

    it.skipNewlines();

    if (FunctionDeclArgs(it)) {
        // matched with paren args
    } else if (it.tryConsume(t_ident)) {
        // matched with ident
    } else {
        return 'no_match';
    }
        
    if (!it.tryConsume(t_right_fat_arrow))
        return 'no_match';

    if (it.isLookingAhead)
        return true;

    data.function_style = 'arrow';

    if (it.nextIs(t_lbrace))
        Block(it);
    else
        Expression(it);
});

const FunctionDecl = step('function_decl', {store:'function_decls'}, (it: Context, data) => {
    data.statement_id = it.current_statement;
    const modifiers = [];

    while (!it.finished()) {
        const text = it.nextText();

        if (functionModifiers[text]) {
            modifiers.push(text);
            it.consume();
            continue;
        }

        break;
    }

    if (it.nextText() !== "function") {
        return 'no_match';
    }

    data.function_style = 'function';

    it.consume(); // function
    it.tryConsume(t_star);

    if (it.nextIs(t_plain_value))
        data.function_name = it.consumeAsText();

    if (it.nextIs(t_lthan)) {
        // Template type
        it.consumeWhile(matchUntilAngleBracePair());
        it.consume(t_gthan);
    }

    // Args
    it.current_function_decl = data.id;
    if (!FunctionDeclArgs(it))
        throw new Error("expected valid args after 'function'");

    it.current_function_decl = null;

    if (it.tryConsume(t_colon)) {
        TypeAnnotation(it);
    }

    data.contents_block_id = Block(it).id;
});

const Statement = step('statement', {store:'statements'}, (it: Context, item) => {
    it.current_statement = item.id;
    item.block_id = it.current_block_id;
    const nextText = it.nextText();

    if (it.tryConsume(t_newline))
        return;

    if (it.tryConsume(t_semicolon))
        return;

    if (it.nextText() === "export") {
        return Export(it);
    }

    // blocks
    if (nextText === "if") {
        return IfStatement(it);
    }

    if (nextText === "for") {
        return ForStatement(it);
    }

    // TODO: switch
    // TODO: try
    // TODO: do
    // TODO: while

    // control flow
    if (nextText === "throw") {
        return ThrowStatement(it);
    }

    if (nextText === "return") {
        return ReturnStatement(it);
    }

    // TODO: yield

    if (nextText === "const" || nextText === "let" || nextText === "var")
        return VariableStatement(it);

    if (nextText === "import") {
        return ImportStatement(it);
    }

    if (nextText === "type")
        return TypeDecl(it);

    if (nextText === "interface")
        return InterfaceDecl(it);

    if (it.nextIs(t_lbrace))
        return Block(it);

    if (it.tryConsume(t_line_comment))
        return;

    if (it.tryConsume(t_semicolon))
        return;

    Expression(it);
});

const Block = step('block', {store:'blocks'}, (it: Context, data) => {
    let previousBlockId = it.current_block_id;
    data.parent_block_id = it.current_block_id;
    data.parent_statement_id = it.current_statement;
    it.current_block_id = data.id;

    it.consume(t_lbrace);
    it.tryConsume(t_newline);
    data.statements_start_pos = it.getPosition();
    StatementList(it);
    data.statements_end_pos = it.getPosition();

    it.tryConsume(t_rbrace);

    it.current_block_id = previousBlockId;
});

const TopLevelBlock = step('top_level_block', {store:'blocks'}, (it: Context, data) => {
    it.current_block_id = data.id;

    StatementList(it);
});

const StatementList = step('statement_list', {}, (it: Context) => {
    while (!it.finished()) {
        if (it.nextIs(t_rbrace))
            return

        const statement = Statement(it);

        if (it.tryConsume(t_semicolon))
            statement.end_pos = it.getPosition();

        if (it.tryConsume(t_newline))
            statement.end_pos = it.getPosition();
    }
});

const IfStatement = step('if', {}, (it: Context) => {
    it.consume();

    const lparen = it.next();
    it.consume(t_lparen);
    it.jumpTo(lparen.pairsWithIndex);
    it.consume(t_rparen);
    it.tryConsume(t_newline);

    if (it.nextIs(t_lbrace)) {
        Block(it);
    } else {
        Statement(it);
    }
});

const ForStatement = step('for_block', {}, (it: Context) => {
    it.consume();

    const lparen = it.next();
    it.consume(t_lparen);
    it.jumpTo(lparen.pairsWithIndex);
    it.consume(t_rparen);
    it.tryConsume(t_newline);

    if (it.nextIs(t_lbrace)) {
        Block(it);
    } else {
        Statement(it);
    }
});

const ThrowStatement = step('throw_statement', {}, (it: Context) => {
    it.consume();
    Expression(it);
});

const ReturnStatement = step('return_statement', {}, (it: Context) => {
    it.consume();
    Expression(it);
});

const TypeAnnotation = step('type_annotation', {}, (it: Context) => {

    it.tryConsume(t_plain_value);

    if (it.nextIs(t_lthan)) {
        it.consumeWhile(matchUntilAngleBracePair());
        it.consume(t_gthan);
        return;
    }

    if (it.nextIs(t_lbracket)) {
        const start = it.next();
        it.consume(t_lbracket);
        it.jumpTo(start.pairsWithIndex);
        it.consume(t_rbracket);
        return;
    }
});

const VariableStatement = step('variable_statement', { store: 'variable_statements' }, (it: Context, item) => {
    it.consume(); // let / const / var

    item.name = it.consumeAsText();

    if (it.tryConsume(t_colon))
        TypeAnnotation(it);

    if (it.tryConsume(t_equals))
        Expression(it);
});

const Expression = step('expression', {}, (it: Context) => {
    // TODO: comma seperated expression sequence
    return InfixExpression(it);
});

const InfixExpression = step('infix_expression', {}, (it: Context) => {
    while (true) {
        ExpressionWithTypeAnnotation(it);

        if (it.tryConsume(t_plus) || it.tryConsume(t_dash) || it.tryConsume(t_star) || it.tryConsume(t_slash)
           || it.tryConsume(t_gthan) || it.tryConsume(t_lthan) ) {
            continue;
        }

        break;
    }
});

const ExpressionWithTypeAnnotation = step('expression_with_annotation', {}, (it: Context) => {
    ExpressionWithPostfix(it);

    if (it.tryConsume(t_colon))
        TypeAnnotation(it);
});

const ExpressionWithPostfix = step('expression_with_postfix', {}, (it: Context) => {
    SingleExpression(it);

    while (true) {
        if (it.tryConsume(t_dot)) {
            // TODO: should be identifier
            SingleExpression(it);
            continue;
        }

        // TODO: [index] access

        break;
    }
});

const SingleExpression = step('single_expression', {}, (it: Context) => {
    if (it.nextText() === "new")
        return NewExpression(it);

    if (FunctionDecl(it))
        return;

    if (ArrowFunctionDecl(it))
        return;

    if (it.nextIs(t_lparen)) {
        // parenthesized expression
        it.consume(t_lparen);

        if (it.tryConsume(t_rparen))
            // empty parens
            return;
            
        Expression(it);

        it.skipNewlines();

        it.consume(t_rparen);
        return;
    }

    if (it.nextIs(t_lbracket)) {
        // array literal
        const start = it.next();
        it.consume(t_lbracket);
        it.jumpTo(start.pairsWithIndex);
        it.consume(t_rbracket);
        return;
    }

    if (it.nextIs(t_lbrace)) {
        // object literal
        const start = it.next();
        it.consume(t_lbrace);
        it.jumpTo(start.pairsWithIndex);
        it.consume(t_rbrace);
        return;
    }

    if (it.nextIs(t_plain_value) && it.nextIs(t_lparen, 1)) {
        return FunctionCall(it);
    }

    if (it.nextIs(t_plain_value)) {
        it.consume();
        return;
    }

    if (it.nextIs(t_quoted_string)) {
        return StringLiteral(it);
    }

    // just consume anything, other than delimeter tokens.
    if (it.nextIs(t_rbracket) || it.nextIs(t_rbrace) || it.nextIs(t_rparen))
        return;

    it.consume();
    
});

const StringLiteral = step('string_literal', { store: 'string_literal' }, (it: Context) => {
    it.consume();
});

const NewExpression = step('new_expression', {}, (it: Context) => {
    it.consume();

    const className = it.consumeAsText();

    if (it.nextIs(t_lparen)) {
        const lparen = it.next();
        it.consume(t_lparen);
        it.jumpTo(lparen.pairsWithIndex);
        it.consume(t_rparen);
    }
});

const FunctionCallArg = step('function_call_arg', {store:'call_args'}, (it: Context, item) => {
    item.function_call_id = it.current_function_call;
    InfixExpression(it);
});

const FunctionCall = step('function_call', {store:'calls'}, (it: Context, item) => {
    const start_pos = it.getPosition();

    it.current_function_call = item.id;

    item.function_name = it.consumeAsText();
    item.statement_id = it.current_statement;

    if (it.nextIs(t_lthan)) {
        // template type
        it.consumeWhile(matchUntilAngleBracePair());
        it.consume(t_gthan);
    }

    it.consume(t_lparen);

    while (!it.finished()) {
        if (it.tryConsume(t_rparen))
            break;

        FunctionCallArg(it);
        it.tryConsume(t_comma);
    }
});

const TypeDecl = step('type_decl', {}, (it: Context) => {
    it.consumeWhile(token => token.match !== t_newline);
    it.consume();
});

const InterfaceDecl = step('interface_decl', {}, (it: Context) => {
    //console.log('InterfaceDecl start');
    if (it.nextText() === "export")
        it.consume();
    if (it.nextText() === "interface")
        it.consume();
    const name = it.consumeAsText();

    const lbrace = it.next();
    it.consume(t_lbrace);
    // skip contents
    it.jumpTo(lbrace.pairsWithIndex);
    it.consume(t_rbrace);
});

function matchUntilAngleBracePair() {
    let depth = 0;
    return token => {
        if (token.match === t_lthan) {
            depth++;
        }

        if (token.match === t_gthan) {
            depth--;
            if (depth <= 0)
                return false;
        }

        return true;
    }
}

export function parseTypescript(contents: string): ParsedProgram {
    const lexed = tokenizeString(contents, { cStyleLineComments: true });
    const it = new Context(lexed);
    TopLevelBlock(it);

    for (const table of Object.values(it.program))
        if (table.rebuildIndexes)
            table.rebuildIndexes();

    it.program.debugAddSourceText(lexed);
    return it.program;
}
