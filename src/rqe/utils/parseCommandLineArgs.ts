
import { QueryTag, QueryTuple } from '../QueryTuple'
import { parseQueryTuple } from '../parser/parseQueryTuple'

export function parseCommandLineArgs(args: string[]): QueryTuple {
    
    let result = new QueryTuple([]);

    let next = 0;
    let openFlagName = null;

    // First phase: look for -- args.
    while (next < args.length) {
        const arg = args[next];

        if (arg === '--') {
            next++;
            break;
        }

        if (arg.startsWith('--')) {
            if (openFlagName)
                result.addTag2(openFlagName);

            openFlagName = arg.replace('--','');
            next++;
            continue;
        }

        if (openFlagName) {
            result.addTag2(openFlagName, arg);
            openFlagName = null;
            next++;
            continue;
        }

        break;
    }

    if (openFlagName)
        result.addTag2(openFlagName);

    // Second phase: consume as RQE query syntax
    const remaining = args.slice(next).join(' ');

    if (remaining !== '') {
        const remainingTuple = parseQueryTuple(remaining);
        result.addTags(remainingTuple.tags);
    }

    return result;
}
