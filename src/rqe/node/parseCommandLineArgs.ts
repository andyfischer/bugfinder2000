
import { lexStringToIterator } from '../lexer/tokenizeString'
import { parseQueryTagFromTokens } from '../parser/parseQueryTag'
import { parseQueryTuple } from '../parser/parseQueryTuple'
import { QueryTag, QueryTuple } from '../QueryTuple'
import { unwrapTagged } from '../TaggedValue'

export interface ParsedCommandLineArgs {
    flags: {
        name: string
        value?: any
    }[]
    tags: QueryTag[]
    query?: string
}

export function parseCommandLineArgs(args: string): ParsedCommandLineArgs {
    const tokens = lexStringToIterator(args);
    const result: ParsedCommandLineArgs = {
        tags: [],
        flags: [],
    };

    let recentFlagName = null;

    while (!tokens.finished()) {
        tokens.skipSpaces();

        if (tokens.nextText() === '-q') {
            tokens.consume()
            tokens.skipSpaces();
            result.query = tokens.consumeAsTextWhile(() => true);
            continue;
        }

        const tag = parseQueryTagFromTokens(tokens);

        if (tag.isFlag) {
            result.flags.push({
                name: tag.attr,
                value: unwrapTagged(tag.value),
            });
        } else {
            result.tags.push(tag);
        }
    }

    return result;
}

export function parseCommandLineArgs2(): QueryTuple {
    const str = process.argv.slice(2).join(' ');
    if (str === '')
        return new QueryTuple([]);

    return parseQueryTuple(str);
}

