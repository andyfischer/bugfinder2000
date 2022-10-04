
import { TokenIterator, t_bar, t_slash, lexStringToIterator } from '../lexer'
import { parseQueryTupleFromTokens } from './parseQueryTuple'
import { ParseError } from './ParseError'
import { Query } from '../Query'
import { QueryTuple } from '../QueryTuple'

interface ParseContext {
}

export function parseQueryFromTokens(it: TokenIterator, ctx: ParseContext): Query | ParseError {

    const steps: QueryTuple[] = [];
    let isFirst = true;
    let isTransform = false;

    while (!it.finished()) {

        it.skipSpaces();

        if (it.finished())
            break;

        if (it.nextIs(t_bar) || it.nextIs(t_slash)) {
            // Queries can start with a leading | , which means to interpret this as a transform.
            // Consume it and loop (and isFirst will be false on next iteration)
            if (isFirst)
                isTransform = true;
            it.consume();
            continue;
        }

        const step: QueryTuple | ParseError = parseQueryTupleFromTokens(it);
        if (step.t === 'parseError')
            return step;

        steps.push(step);

        if (!it.tryConsume(t_bar) && !it.tryConsume(t_slash))
            break;

        isFirst = false;
    }

    return new Query(steps, { isTransform });
}

export function parseQuery(str: string, ctx: ParseContext = {}) {
    try {
        const it = lexStringToIterator(str);
        return parseQueryFromTokens(it, ctx);
    } catch (err) {
        console.error('error parsing: ', str);
        throw err;
    }
}
