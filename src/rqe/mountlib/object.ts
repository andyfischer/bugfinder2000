
import { Task } from '../Step'
import { MountSpec } from '../Schema'
import { parseTableDecl } from '../parser/parseTableDecl'
import { MountPointSpec } from '../MountPoint'

export interface ObjectMountConfig {
    object: any
    func: string
    mount?: MountSpec
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

export function setupObject(opts: ObjectMountConfig): MountPointSpec[] {
    const { object, func } = opts;

    const mountSpec = parseTableDecl(func);
    const [ keyAttr, valueAttr ] = getOneInputAndOutput(func, mountSpec);

    mountSpec.run = (params: Task) => {

        if (params.hasValue(keyAttr)) {
            const key = params.get(keyAttr);

            params.put({[valueAttr]: object[key]});
        } else {
            for (const [key, value] of Object.entries(object)) {
                params.put({[keyAttr]: key, [valueAttr]: value} as any);
            }
        }
    };

    const points = [ mountSpec ];

    if (opts.namespace) {
        for (const attr of opts.namespace)
            for (const point of points)
                point.attrs[attr] = { required: true }
    }

    return points;
}
