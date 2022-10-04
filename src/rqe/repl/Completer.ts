
import { Graph, Queryable } from '../Graph'
import { listEveryVerb } from '../verbs/_list'

export function getCompletions(graph: Queryable, line: string): string[] {
    if (!line || line === "")
        return [];

    let lastWordDivider = -1;

    for (let i=0; i < line.length; i++) {
        const c = line[i];
        if (c === ' ' || c === '|')
            lastWordDivider = i;
    }

    const priorLine = line.substring(0, lastWordDivider+1);
    const lastWord = line.substring(lastWordDivider+1);

    const found = new Map<string,true>();

    for (const verb of listEveryVerb()) {
        if (verb.startsWith(lastWord))
            found.set(verb, true);
    }

    if ((graph as Graph).everyMountPoint) {
        for (const table of (graph as Graph).everyMountPoint()) {
            for (const attr of Object.keys(table.attrs)) {
                if (attr.startsWith(lastWord))
                    found.set(attr, true);
            }
        }
    }

    const completions = [];
    for (const key of found.keys())
        completions.push(priorLine + key);
    return completions;
}
