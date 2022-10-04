
import { Table } from '../Table'
import { Graph } from '../Graph'
import { MountPointSpec } from '../MountPoint'
import { parseTableDecl } from '../parser/parseTableDecl'
import { Task } from '../Step'
import { StreamEvent } from '../Stream'
import { c_done } from '../Enums'
import { QueryModifier } from '../Query'

interface Options {
    table?: Table
    graph?: Graph
    queryModifier?: QueryModifier
}

export function setupCacher(decl: string, options: Options): MountPointSpec {
    const table = options.table || options.graph.builtins.funcCache();

    const mountSpec = parseTableDecl(decl);
    const func_key = decl;

    const queryModifier = options.queryModifier || { with: 'no-cache' };

    mountSpec.run = (step: Task) => {
        step.async();

        const input_tuple_str = step.tupleWithInjectedParameters().toQueryString();

        const found = table.one({ input_tuple: input_tuple_str });

        if (found) {
            // Use value from cache
            for (const event of found.output_stream) {
                step.output.receive(event);
            }
            return;
        }

        // Not found. Run the backing func and store the output in cache.
        const eventsToCache: StreamEvent[] = [];

        step.queryRelated(queryModifier, step.parameters)
        .sendTo({
            receive(evt) {
                // console.log('caching event: ', evt);
                eventsToCache.push(evt);

                if (evt.t === c_done) {
                    table.put({
                        func: func_key,
                        input_tuple: input_tuple_str,
                        output_stream: eventsToCache,
                        cached_at: (new Date()).toISOString(),
                    });
                }

                step.output.receive(evt);
            }
        });
    }

    return mountSpec;
}
