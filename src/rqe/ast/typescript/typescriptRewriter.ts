
import { Graph } from '../../Graph'
import { runCommandLineProcess } from '../../node/CommandLineApp'
import { Query, func } from '../..'
import { tokenizeString } from '../../lexer/tokenizeString'
import { TokenIterator } from '../../lexer/TokenIterator'
import { Table } from '../../Table'
import { t_newline, t_lbrace, t_rbrace, t_lbracket, t_rbracket, t_star, t_lparen, t_rparen,
    t_colon, t_lthan, t_gthan, t_line_comment,
    t_equals, t_plain_value, t_semicolon, t_dot,
    t_quoted_string } from '../../lexer/tokens'

func('rewrite_typescript contents rule -> updated', (contents, rule) => {
    const parsed = parseTypescript(contents);
    const updated = rewriteTypescript(parsed, rule);
    return { updated };
});

function rewriteTypescript(parsed: Graph, rule: Query) {

    // Run the rule and trace changes
    /*
    parsed.query(rule, null, {
        mod: {
          beforeCallPoint(
            block: Block,
            updated: Block,
            term: Term,
            point: MountPoint
          ) {
            updated.comment("trace changes made");
            //const output = updated.new_stream();
            //const tracerStep = updated.step_with_output(term.inputs[1], updated.new_stream());
            //updated.call_mount_point(findBestPointMatch(graph, "get put! traces").point.getRef(), tracerStep);
          }
        }
    });

    const fixedQuery = {
        t: 'pipedQuery',
        steps: []
    };

    for (const step of rule.steps) {
        const attrs = new Set();
        for (const tag of step.tags)
            attrs.add(tag.attr);

    }

    parsed.query(rule).sync();
    */
}

interface Context {
    imports: Table
    functions: Table
    functionCalls: Table
    errors: Table
}

function captureError(ctx: Context, it: TokenIterator, message: string, stepName: string) {
    const pos = it.getPosition();
    const token = it.next();
    ctx.errors.put({ message: `error parsing ${stepName} [line ${token.lineStart} col ${token.columnStart}] ${message} `
                   +`(next token = ${token.match.name}, text = "${it.sourceText.getTokenText(token)}")`, pos });
}

function wrapStep(name: string, callback: (ctx: Context, it: TokenIterator) => void) {
    return (ctx: Context, it: TokenIterator) => {
        const start = it.getPosition();

        try {
            callback(ctx, it);

            if (it.getPosition() === start)
                throw new Error("internal error: token position didn't change");

        } catch (err) {
            captureError(ctx, it, err.message, name);

            if (it.getPosition() === start)
                it.advance();
        }
    }
}

const functionModifiers = {
    export: true,
    async: true,
};

const parseImport = wrapStep('import', (ctx: Context, it: TokenIterator) => {
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

    ctx.imports.put({
        start_pos,
        end_pos: it.getPosition(),
        text: it.sourceText.getTextRange(start_pos, it.getPosition()),
    });
});

const parseExport = wrapStep('export', (ctx: Context, it: TokenIterator) => {
    const start_pos = it.getPosition();
    it.consume();
});

function lookaheadIsFunctionDecl(it: TokenIterator) {
    let lookahead = 0;

    while (!it.finished(lookahead)) {
        lookahead = it.lookaheadSkipSpaces(lookahead);
        
        if (it.nextIs(t_star, lookahead)) {
            lookahead++;
            continue;
        }

        const nextText = it.nextText(lookahead);

        if (functionModifiers[nextText]) {
            lookahead++;
            continue;
        }

        if (nextText === "function")
            return true;

        return false;
    }

    return false;
}

const parseFunctionDecl = wrapStep('function', (ctx: Context, it: TokenIterator) => {
    const modifiers = [];
    const start_pos = it.getPosition();

    while (!it.finished()) {
        const text = it.nextText();

        if (functionModifiers[text]) {
            modifiers.push(text);
            it.consume();
            continue;
        }

        break;
    }

    it.tryConsume(t_star);

    if (it.nextText() !== "function") {
        throw new Error("expected 'function'");
    }

    it.consume(); // function
    it.tryConsume(t_star);
    const name = it.consumeAsText();

    if (it.nextIs(t_lthan)) {
        // Template type
        it.consumeWhile(matchUntilAngleBracePair());
        it.consume(t_gthan);
    }

    // Args
    const lparen = it.next();
    it.consume(t_lparen);
    it.jumpTo(lparen.pairsWithIndex);
    it.consume(t_rparen);

    if (it.tryConsume(t_colon)) {
        parseTypeAnnotation(ctx, it);
    }

    parseBlockWithBrackets(ctx, it);

    ctx.functions.put({
        name,
        start_pos,
        end_pos: it.getPosition(),
        text: it.sourceText.getTextRange(start_pos, it.getPosition()),
    });
});

const parseStatement = wrapStep('statement', (ctx: Context, it: TokenIterator) => {
    const nextText = it.nextText();

    let lookAfterExport = 0;

    if (it.nextText() === "export") {
        lookAfterExport++;
        lookAfterExport = it.lookaheadSkipSpaces(lookAfterExport);
    }

    const nextAfterExport = it.nextText(lookAfterExport);

    if (nextText === "if") {
        return parseIfBlock(ctx, it);
    }

    if (nextText === "for") {
        return parseForBlock(ctx, it);
    }

    if (nextText === "throw") {
        return parseThrow(ctx, it);
    }

    if (nextText === "return") {
        return parseReturn(ctx, it);
    }

    if (nextAfterExport === "const" || nextAfterExport === "let" || nextAfterExport === "var")
        return parseVariableBinding(ctx, it);

    if (nextAfterExport === "import") {
        return parseImport(ctx, it);
    }

    if (lookaheadIsFunctionDecl(it))
        return parseFunctionDecl(ctx, it);

    if (nextAfterExport === "type")
        return parseTypeDecl(ctx, it);

    if (nextAfterExport === "interface")
        return parseInterfaceDecl(ctx, it);

    if (it.nextIs(t_lbrace))
        return parseBlockWithBrackets(ctx, it);

    if (it.tryConsume(t_line_comment))
        return

    parseExpression(ctx, it);
});

const parseStatementList = wrapStep('statement_list', (ctx: Context, it: TokenIterator) => {
    while (!it.finished()) {
        if (it.tryConsume(t_newline))
            continue;

        if (it.nextIs(t_rbrace))
            return;

        parseStatement(ctx, it);

        it.tryConsume(t_semicolon);
    }
});

const parseBlockWithBrackets = wrapStep('block_with_brackets', (ctx: Context, it: TokenIterator) => {
    it.consume(t_lbrace);
    parseStatementList(ctx, it);
    it.consume(t_rbrace);
});

const parseIfBlock = wrapStep('if_block', (ctx: Context, it: TokenIterator) => {
    it.consume();

    const lparen = it.next();
    it.consume(t_lparen);
    it.jumpTo(lparen.pairsWithIndex);
    it.consume(t_rparen);
    it.tryConsume(t_newline);

    if (it.nextIs(t_lbrace)) {
        parseBlockWithBrackets(ctx, it);
    } else {
        parseStatement(ctx, it);
    }
});

const parseForBlock = wrapStep('for_block', (ctx: Context, it: TokenIterator) => {
    it.consume();

    const lparen = it.next();
    it.consume(t_lparen);
    it.jumpTo(lparen.pairsWithIndex);
    it.consume(t_rparen);
    it.tryConsume(t_newline);

    if (it.nextIs(t_lbrace)) {
        parseBlockWithBrackets(ctx, it);
    } else {
        parseStatement(ctx, it);
    }
});

const parseThrow = wrapStep('throw_statement', (ctx: Context, it: TokenIterator) => {
    it.consume();
    parseExpression(ctx, it);
});

const parseReturn = wrapStep('return_statement', (ctx: Context, it: TokenIterator) => {
    it.consume();
    parseExpression(ctx, it);
});

const parseTypeAnnotation = wrapStep('type_annotation', (ctx: Context, it: TokenIterator) => {

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

const parseVariableBinding = wrapStep('variable_binding', (ctx: Context, it: TokenIterator) => {
    if (it.nextText() === "export")
        it.consume();

    it.consume(); // let / const / var

    const name = it.consume();

    if (it.tryConsume(t_colon))
        parseTypeAnnotation(ctx, it);

    if (it.tryConsume(t_equals))
        parseExpression(ctx, it);
});

const parseExpression = wrapStep('expression', (ctx: Context, it: TokenIterator) => {
    if (it.nextText() === "new")
        return parseNewExpression(ctx, it);

    parseAtomWithSuffix(ctx, it);
});

const parseNewExpression = wrapStep('new_expression', (ctx: Context, it: TokenIterator) => {
    it.consume();

    const className = it.consumeAsText();

    if (it.nextIs(t_lparen)) {
        const lparen = it.next();
        it.consume(t_lparen);
        it.jumpTo(lparen.pairsWithIndex);
        it.consume(t_rparen);
    }
});

const parseAtomWithSuffix = wrapStep('atom_with_suffix', (ctx: Context, it: TokenIterator) => {
    parseAtom(ctx, it);

    while (true) {
        if (it.tryConsume(t_dot)) {
            parseAtom(ctx,it);
            continue;
        }

        break;
    }
});

const parseAtom = wrapStep('atom', (ctx: Context, it: TokenIterator) => {
    if (it.tryConsume(t_lparen)) {
        // parenthesized expression
        parseExpression(ctx, it);
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
        return parseFunctionCall(ctx, it);
    }

    if (it.nextIs(t_plain_value)) {
        it.consume();
        return;
    }

    if (it.nextIs(t_quoted_string)) {
        it.consume();
        return;
    }

    // just consume anything, other than delimeter tokens.
    if (it.nextIs(t_rbracket) || it.nextIs(t_rbrace) || it.nextIs(t_rparen))
        return;

    it.consume();
});

const parseFunctionCall = wrapStep('function_call', (ctx: Context, it: TokenIterator) => {
    const start_pos = it.getPosition();

    const function_name = it.consumeAsText();

    if (it.nextIs(t_lthan)) {
        // template type
        it.consumeWhile(matchUntilAngleBracePair());
        it.consume(t_gthan);
    }

    const lparen = it.next();
    it.consume(t_lparen);
    it.jumpTo(lparen.pairsWithIndex);
    it.consume(t_rparen);

    ctx.functionCalls.put({
        start_pos,
        end_pos: it.getPosition(),
        text: it.sourceText.getTextRange(start_pos, it.getPosition()),
        function_name,
    });
});

function untilMatchingBrace() {
    let depth = 0;

    return token => {
        if (token.match === t_lbrace)
            depth++;

        if (token.match === t_rbrace) {
            depth--;
            if (depth <= 0)
                return false;
        }

        return true;
    }
}

const parseTypeDecl = wrapStep('typeDecl', (ctx: Context, it: TokenIterator) => {
    it.consumeWhile(token => token.match !== t_newline);
    it.consume();
});

const parseInterfaceDecl = wrapStep('interfaceDecl', (ctx: Context, it: TokenIterator) => {
    //console.log('parseInterfaceDecl start');
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

function parseTypescript(contents: string): Graph {

    const graph = new Graph();

    const imports = graph.newTable({
        name: 'imports',
        attrs: {
            start_pos: {},
            end_pos: {},
            text: {},
            lhs: {},
            filename: {},
        }
    });

    const functions = graph.newTable({
        name: 'functions',
        attrs: {
            start_pos: {},
            end_pos: {},
            name: {},
        }
    });

    const functionCalls = graph.newTable({
        name: 'function_calls',
        attrs: {
            start_pos: {},
            end_pos: {},
            function_name: {},
            text: {},
        }
    });

    const errors = graph.newTable({
        name: 'errors',
        attrs: {
            message: {},
            pos: {},
        }
    });

    const tokens = tokenizeString(contents, {
        autoSkipSpaces: true,
        cStyleLineComments: true
    });

    const it = new TokenIterator(tokens);
    parseStatementList({ imports, functions, functionCalls, errors }, it);

    // const formatter = new LiveConsoleFormatter({graph: getGraph() });
    // formatter.printTable(imports);
    // formatter.printTable(functions);
    // formatter.printTable(functionCalls);
    // formatter.printTable(errors);

    return graph;
}

if (require.main === module) {
    runCommandLineProcess();
}

// testing query:
// load_subprocess cmd="node dist/node/lib/typescriptRewriter.js" put!
// category=subprocess enabled=true put!
// fs filename=src/Query.ts contents | join rewrite_typescript contents rule updated | just filename updated


// notes
// how to implement the rule?
// Create a closed Graph
// Run the rules..
//  - If any tables are selected then those tables are replaced by the transform result.
//  - If any tables are not selected then those are pass through.

// want to capture deltas on the transformation
// we could override and catch calls to the put! and delete! verbs?
//  - add hooks for intercepting these calls?
//  - spy api?
//  - insert before and after steps?

// 
