
import { Graph } from '../Graph'
import { MountPointSpec } from '../MountPoint'

export function setupBrowse(graph: Graph): MountPointSpec[] {

    return [{
        attrs: {
            browse: {},
            name: { assumeInclude: true },
            attrs: { assumeInclude: true },
            provider_id: { required: false },
        },
        run(step) {
            step.output.putSchema({ name: { type: 'string' }, attrs: { type: 'TableAttrsList' } });

            for (const point of graph.everyMountPoint()) {
                const attrs = {};
                for (const [ attr, details ] of Object.entries(point.attrs))
                    attrs[attr] = details;

                step.put({
                    attrs,
                    name: point.name,
                    provider_id: point.providerId,
                });
            }
        }
    }]
}
