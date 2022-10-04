
import { MountPointSpec } from '../MountPoint'
import { parseTableDecl } from '../parser/parseTableDecl'
import { Queryable } from '../Graph'
import { Task } from '../Step'
import { QueryModifier } from '../Query'

interface Options {
    graph: Queryable
    queryModifier?: QueryModifier
}

export function forwardToRemote(step: Task, options: Options) {
    let tuple = step.tupleWithoutParams;

    if (options.queryModifier)
        tuple = tuple.getRelated(options.queryModifier);

    // todo - propogate resource tags?

    const parameters = step.extractRelevantParameters();
    parameters['$input'] = step.input;
    
    let output = options.graph.query(tuple, parameters);
    output.sendTo(step.output);
    step.streaming();
}

export function setupRemoteQueryable(decl: string | MountPointSpec, options: Options): MountPointSpec {
    const mountSpec = parseTableDecl(decl);
    const graph = options.graph;

    if (!graph)
        throw new Error('missing: graph');

    mountSpec.run = (step: Task) => {
        forwardToRemote(step, options);
    }

    return mountSpec;
}
