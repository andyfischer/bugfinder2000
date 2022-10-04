
import Context from './Context'
import { TokenIterator } from './TokenIterator'
import { LexedText } from './LexedText'
import { LexerSettings } from './LexerSettings'
import { t_ident, t_integer, t_unrecognized, t_space, t_double_dash,
    t_line_comment, t_quoted_string, t_double_equals,
    t_double_bar, t_double_amp,
    t_plain_value, t_gthaneq, t_lthaneq, t_right_arrow,
    t_right_fat_arrow, tokenFromSingleCharCode } from './tokens'

const c_0 = '0'.charCodeAt(0);
const c_9 = '9'.charCodeAt(0);
const c_a = 'a'.charCodeAt(0);
const c_z = 'z'.charCodeAt(0);
const c_A = 'A'.charCodeAt(0);
const c_Z = 'Z'.charCodeAt(0);
const c_dash = '-'.charCodeAt(0);
const c_gthan = '>'.charCodeAt(0);
const c_lthan = '<'.charCodeAt(0);
const c_under = '_'.charCodeAt(0);
const c_space = ' '.charCodeAt(0);
const c_equals = '='.charCodeAt(0);
const c_dot = '.'.charCodeAt(0);
const c_newline = '\n'.charCodeAt(0);
const c_hash = '#'.charCodeAt(0);
const c_single_quote = "'".charCodeAt(0);
const c_double_quote = "\"".charCodeAt(0);
const c_backslash = '\\'.charCodeAt(0);
const c_exclaim = '!'.charCodeAt(0);
const c_slash = '/'.charCodeAt(0);
const c_bar = '|'.charCodeAt(0);
const c_amp = '&'.charCodeAt(0);

function isLowerCase(c) {
    return c >= c_a && c <= c_z;
}

function isUpperCase(c) {
    return c >= c_A && c <= c_Z;
}

function isDigit(c) {
    return c >= c_0 && c <= c_9;
}

function canStartPlainValue(c) {
    return (isLowerCase(c) || isUpperCase(c) || isDigit(c)
        || c === c_dash
        || c === c_under)
}

function canContinuePlainValue(c) {
    return (isLowerCase(c) || isUpperCase(c) || isDigit(c)
        || c === c_dash
        || c === c_under
        || c === c_exclaim);
}

function canStartIdentifier(c) {
    return isLowerCase(c) || isUpperCase(c) || c === c_under;
}

function canContinueIdentifier(c) {
    return (isLowerCase(c) || isUpperCase(c) || isDigit(c)
        || c === c_dash
        || c === c_under);
}

function consumeQuotedString(input: Context, lookingFor: number) {
    let lookahead = 1;

    while (true) {
        if (input.finished(lookahead))
            break;

        if (input.next(lookahead) === c_backslash) {
            // escape next character
            lookahead += 2;
            continue;
        }

        if (input.next(lookahead) === lookingFor) {
            lookahead += 1;
            break;
        }

        lookahead += 1;
    }

    return input.consume(t_quoted_string, lookahead);
}

function consumePlainValue(input: Context) {
    let lookahead = 0;
    let isAllNumbers = true;

    while (canContinuePlainValue(input.next(lookahead))) {
        if (!isDigit(input.next(lookahead)))
            isAllNumbers = false;
        lookahead++;
    }

    if (isAllNumbers)
        return input.consume(t_integer, lookahead);
    else
        return input.consume(t_plain_value, lookahead);
}

function consumeNext(input: Context) {
    const c: number = input.next(0);

    if (c === c_equals && input.next(1) === c_equals)
        return input.consume(t_double_equals, 2);

    if (c === c_dash && input.next(1) === c_dash)
        return input.consume(t_double_dash, 2);

    if (c === c_dash && input.next(1) === c_gthan)
        return input.consume(t_right_arrow, 2);

    if (c === c_equals && input.next(1) === c_gthan)
        return input.consume(t_right_fat_arrow, 2);

    if (c === c_bar && input.next(1) === c_bar)
        return input.consume(t_double_bar, 2);

    if (c === c_amp && input.next(1) === c_amp)
        return input.consume(t_double_amp, 2);

    if (c === c_gthan && input.next(1) === c_equals)
        return input.consume(t_gthaneq, 2);

    if (c === c_lthan && input.next(1) === c_equals)
        return input.consume(t_lthaneq, 2);

    if (c === c_slash && input.next(1) === c_slash && input.settings.cStyleLineComments)
        return input.consumeWhile(t_line_comment, c => c !== c_newline);

    if (canStartPlainValue(c))
        return consumePlainValue(input);

    if (canStartIdentifier(c))
        return input.consumeWhile(t_ident, canContinueIdentifier);

    if (c === c_hash && input.settings.bashStyleLineComments)
        return input.consumeWhile(t_line_comment, c => c !== c_newline);

    if (c === c_single_quote)
        return consumeQuotedString(input, c_single_quote);
    
    if (c === c_double_quote)
        return consumeQuotedString(input, c_double_quote);

    if (c === c_space)
        return input.consumeWhile(t_space, c => c === c_space);

    if (tokenFromSingleCharCode[c])
        return input.consume(tokenFromSingleCharCode[c], 1);

    return input.consume(t_unrecognized, 1);
}

export function tokenizeString(str: string, settings: LexerSettings = {}): LexedText {
    const context = new Context(str, settings);

    while (!context.finished()) {

        const pos = context.index;

        context.resultTokens.push(consumeNext(context));

        if (context.index === pos) {
            throw new Error(`internal error: lexer stalled at index `
                            +`${context.index} (next char is ${context.nextChar(0)}`);
        }
    }

    const result = new LexedText(str);
    result.tokens = context.resultTokens;
    return result;
}

export function lexStringToIterator(str: string, settings?: LexerSettings): TokenIterator {
    return new TokenIterator(tokenizeString(str, settings));
}
