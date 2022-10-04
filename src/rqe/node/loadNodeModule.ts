
import { Graph } from '../Graph'
import { MountPointSpec } from '../MountPoint'

export function getSetupFromModule(moduleContents): MountPointSpec[] {
    const points: MountPointSpec[] = []

    if (moduleContents.mountTables) {
        throw new Error('mountTables no longer supported');
    }

    for (const [name,value] of Object.entries(moduleContents)) {
        if (value && (value as any).t === 'tableBindParams') {
            const bind: MountPointSpec = {
                ...(value as any),
                name,
            }

            points.push(bind);
        }
    }

    return points;
}

export function runSetupFromModule(graph: Graph, moduleContents) {
    const points = getSetupFromModule(moduleContents);
    const module = graph.mount(points);
    return module;
}
