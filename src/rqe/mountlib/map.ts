
import { Task } from '../Step'
import { MountPointSpec } from '../MountPoint'
import { parseTableDecl } from '../parser/parseTableDecl'

export interface MapMountConfig {
    map: Map<any,any>
    func: string
    name?: string
    namespace?: string[]
}

function getOneInputAndOutput(decl: string, spec: MountPointSpec) {
    const required = [];
    const optional = [];
    for (const [attr, config] of Object.entries(spec.attrs)) {
        if (config.required)
            required.push(attr);
        else
            optional.push(attr);
    }
    if (required.length !== 1)
        throw new Error("Expected one input attribute: " + decl);
    if (optional.length !== 1)
        throw new Error("Expected one output attribute: " + decl);

    return [ required[0], optional[0] ]
}

export function setupMap(opts: MapMountConfig): MountPointSpec[] {

    let { map, func } = opts;

    const mountSpec = parseTableDecl(func);
    const [ keyAttr, valueAttr ] = getOneInputAndOutput(func, mountSpec);

    mountSpec.run = (step: Task) => {
        if (step.hasValue(keyAttr)) {
            const key = step.get(keyAttr);

            if (map.has(key)) {
                step.put({ [keyAttr]: key, [valueAttr]: map.get(key) });
            }
        } else {
            for (const [key,value] of map.entries()) {
                step.put({ [keyAttr]: key, [valueAttr]: value });
            }
        }
    }

    const points = [ mountSpec ];

    if (opts.namespace) {
        for (const attr of opts.namespace)
            for (const point of points)
                point.attrs[attr] = { required: true }
    }

    return points;
}
