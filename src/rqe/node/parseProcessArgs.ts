
import { parseQuery } from '../parser/parseQuery'

export function parseProcessArgs() {
    const str = process.argv.slice(2).join(' ');

    const query = parseQuery(str);

    return query;
}
