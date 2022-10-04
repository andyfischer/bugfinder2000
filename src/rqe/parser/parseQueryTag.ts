
import { TokenIterator, t_plain_value, t_star, t_slash, t_colon,
    t_dot, t_question, t_integer, t_dash, t_dollar, t_lbracket, t_rbracket,
    t_lparen, t_rparen, t_equals, t_double_dash, lexStringToIterator } from '../lexer'
import { Query } from '../Query'
import { QueryTuple, QueryTag } from '../QueryTuple'
import { parseQueryFromTokens } from './parseQuery'
import { ParseError } from './ParseError'

export function parseQueryTagFromTokens(it: TokenIterator): QueryTag {

    const result: QueryTag = {
        t: 'tag',
        attr: null,
        value: {
            t: 'no_value'
        }
    }

    // Identifier prefix
    if (it.tryConsume(t_lbracket)) {
        result.identifier = it.consumeAsText();

        if (!it.tryConsume(t_rbracket))
            throw new Error("expected ']', found: " + it.nextText());

        it.skipSpaces();
    }

    if (it.tryConsume(t_star)) {
        result.specialAttr = { t: 'star' };
        return result;
    }

    if (it.tryConsume(t_dollar)) {
        const unboundVar = it.consumeAsUnquotedText();
        result.attr = unboundVar;
        result.identifier = unboundVar;
        if (it.tryConsume(t_question)) {
            result.isOptional = true;
        }
        return result;
    }

    if (it.tryConsume(t_double_dash))
        result.isFlag = true;

    // Attribute
    result.attr = it.consumeAsUnquotedText();
    while (it.nextIs(t_plain_value)
            || it.nextIs(t_dot)
            || it.nextIs(t_dash)
            || it.nextIs(t_integer)
            || it.nextIs(t_slash))
        result.attr += it.consumeAsUnquotedText();

    if (result.attr === '/')
        throw new Error("syntax error, attr was '/'");

    if (it.tryConsume(t_question)) {
        result.isOptional = true;
    }

    if (it.tryConsume(t_lparen)) {
        let query: Query | ParseError = parseQueryFromTokens(it, { });
        if (query.t === 'parseError')
            throw new Error(query.message);

        result.value = query as (Query | QueryTuple);

        if (!it.tryConsume(t_rparen))
            throw new Error("Expected )");

        return result;
    }

    if (it.tryConsume(t_equals)) {
        it.skipSpaces();

        if (it.tryConsume(t_lparen)) {
            const query = parseQueryFromTokens(it, {});

            if (query.t === 'parseError')
                throw new Error("Parse error: " + query.t);

            if (!it.tryConsume(t_rparen))
                throw new Error('Expected )');

            result.value = query;
        } else {

            let strValue = it.consumeAsUnquotedText();

            // Continue to parse tokens that are valid in a string literal.
            while (it.nextIs(t_plain_value) || it.nextIs(t_dot) || it.nextIs(t_slash) || it.nextIs(t_colon))
                strValue += it.consumeAsUnquotedText();

            result.value = { t: 'str_value', str: strValue };
        }
    }

    return result;
}

export function parseQueryTag(str: string): QueryTag {
    const it = lexStringToIterator(str);
    return parseQueryTagFromTokens(it);
}
