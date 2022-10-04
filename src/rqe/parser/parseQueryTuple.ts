
import { TokenIterator, t_plain_value, t_newline, t_bar, t_slash,
    t_integer, t_rparen, t_right_arrow, lexStringToIterator } from '../lexer'
import { parseQueryTagFromTokens } from './parseQueryTag'
import { ParseError } from './ParseError'
import { QueryTag, QueryTuple } from '../QueryTuple'

function maybeParseVerbWithCount(it: TokenIterator): QueryTag[] {
    let startPos = it.position;

    if (it.nextText() !== "limit" && it.nextText() !== "last")
        return null;

    const verb = it.nextText();
    it.consume();
    it.skipSpaces();

    if (!it.nextIs(t_integer)) {
        it.position = startPos;
        return null;
    }

    const count = it.nextText();
    it.consume(t_integer);

    // Success
    const tags: QueryTag[] = [{
        t: 'tag',
        attr: verb,
        value: { t: 'no_value' },
    }, {
        t: 'tag',
        attr: 'count',
        value: { t: 'str_value', str: count },
    }];

    for (const entry of parseTags(it)) {
        tags.push(entry);
    }

    return tags;
}

function maybeParseWaitVerb(it: TokenIterator): QueryTag[] {
    let startPos = it.position;

    if (it.nextText() !== "wait")
        return null;

    const verb = it.nextText();
    it.consume();
    it.skipSpaces();

    if (!it.nextIs(t_integer)) {
        it.position = startPos;
        return null;
    }

    const duration = it.nextText();
    it.consume(t_integer);

    // Success
    const tags: QueryTag[] = [{
        t: 'tag',
        attr: verb,
        value: { t: 'no_value' },
    }, {
        t: 'tag',
        attr: 'duration',
        value: { t: 'str_value', str: duration },
    }]

    for (const tag of parseTags(it)) {
        tags.push(tag);
    }

    return tags;
}

function maybeParseRename(it: TokenIterator): QueryTag[] {
    let startPos = it.position;

    if (it.nextText() !== "rename")
        return null;

    const verb = it.nextText();
    it.consume();
    it.skipSpaces();

    let from: string;
    let to: string;

    if (!it.nextIs(t_plain_value)) {
        it.position = startPos;
        return null;
    }

    from = it.consumeAsText();
    it.skipSpaces();

    if (!it.nextIs(t_right_arrow)) {
        it.position = startPos;
        return null;
    }

    it.consume(t_right_arrow);
    it.skipSpaces();

    if (!it.nextIs(t_plain_value)) {
        it.position = startPos;
        return null;
    }

    to = it.consumeAsText();

    // Success
    const tags: QueryTag[] = [{
        t: 'tag',
        attr: verb,
        value: { t: 'no_value' },
    }, {
        t: 'tag',
        attr: 'from',
        value: { t: 'str_value', str: from },
    },{
        t: 'tag',
        attr: 'to',
        value: { t: 'str_value', str: to },
    }];

    for (const tag of parseTags(it)) {
        tags.push(tag);
    }

    return tags;
}

function maybeParseWhere(it: TokenIterator) {
    let startPos = it.position;

    if (it.nextText() !== "where")
        return null;

    it.consume();
    it.skipSpaces();

    const conditions = [];

    // TODO
}

const specialSyntaxPaths = [
    maybeParseVerbWithCount,
    maybeParseRename,
    maybeParseWaitVerb,
];

function* parseTags(it: TokenIterator) {
    while (true) {
        it.skipSpaces();

        if (it.finished() || it.nextIs(t_newline) || it.nextIs(t_bar) || it.nextIs(t_slash) || it.nextIs(t_rparen))
            break;

        const tag: QueryTag = parseQueryTagFromTokens(it);

        yield tag;
    }
}

export function parseQueryTupleFromTokens(it: TokenIterator): QueryTuple | ParseError {

    it.skipSpaces();

    // Special syntaxes
    for (const path of specialSyntaxPaths) {
        const parseSuccess = path(it);
        if (parseSuccess)
            return new QueryTuple(parseSuccess);
    }
    
    let tags: QueryTag[] = [];
    
    for (const tag of parseTags(it)) {
        tags.push(tag);
    }

    if (tags.length === 0) {
        return {
            t: 'parseError',
            parsing: 'queryTuple',
            message: 'No verb found'
        }
    }

    return new QueryTuple(tags);
}

export function parseQueryTupleOrError(str: string) {
    const it = lexStringToIterator(str);
    return parseQueryTupleFromTokens(it);
}

export function parseQueryTuple(str: string) {
    const result = parseQueryTupleOrError(str);
    if (result.t === 'parseError') {
        console.error(result);
        throw new Error("Error parsing a query tuple: " + str);
    }

    return result as QueryTuple;
}
