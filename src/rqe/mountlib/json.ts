
import { Query, QueryLike, toQuery } from '../Query'
import { Task } from '../Step'
import { parseTableDecl } from '../parser/parseTableDecl'
import { runCommandLineProcess } from '../node/CommandLineApp'
import { MountPointSpec, mountSpecPlusAttr } from '../MountPoint'
import { Stream } from '../Stream'

interface Config {
    fetchJson: QueryLike
    jsonRootPath?: string
    func: string
    upstreamAttrs: string[]
}

class AddressableObject {
    root: any
    path: string[]

    constructor(root, path: string[]) {
        this.root = root;
        this.path = path;
    }

    get() {
        let result = this.root;

        for (const el of this.path) {
            if (!result)
                return null;

            result = result[el];
        }

        return result;
    }

    set(value: any) {
        const path = this.path;

        if (path.length === 0) {
            this.root = value;
            return;
        }

        let target = this.root;

        for (let i=0; i < path.length - 1; i++) {
            if (!target)
                return null;

            target = target[path[i]];
        }

        target[path[path.length-1]] = value;
    }
}

function parsePath(s: string) {
    return s.split('.');
}

class JsonMount {
    upstreamQuery: Query
    config: Config
    path: string[]
    mainKeyAttr: string
    outputAttrs: string[] = []

    getSpec: MountPointSpec
    putSpec: MountPointSpec

    constructor(config: Config) {
        this.config = config;
        this.upstreamQuery = toQuery(config.fetchJson);
        this.path = config.jsonRootPath ? parsePath(config.jsonRootPath) : [];

        const mountSpec = parseTableDecl(config.func);

        // Figure out the attrs to use
        for (const [attr, attrConfig] of Object.entries(mountSpec.attrs)) {
            if (config.upstreamAttrs.indexOf(attr) !== -1)
                continue;

            if (attrConfig.required) {
                if (this.mainKeyAttr)
                    throw new Error("found multiple input attrs: " + this.mainKeyAttr + " & " + attr);

                this.mainKeyAttr = attr;
                continue;
            }

            this.outputAttrs.push(attr);
        }

        this.getSpec = {
            ...mountSpec,
            run: step => this.performGet(step),
        };

        // Can list all of 'key's
        this.getSpec.attrs[this.mainKeyAttr] = {...this.getSpec.attrs[this.mainKeyAttr]};
        this.getSpec.attrs[this.mainKeyAttr].requiresValue = false;

        this.putSpec = {
            ...mountSpecPlusAttr(mountSpec, 'put!'),
            run: step => this.performPut(step),
        }
    }

    loadObjects(step: Task): Stream {
        const config = this.config;

        const upstreamQuery = this.upstreamQuery.remapTuples(tuple => {
            tuple = tuple.shallowCopy();
            for (const attr of config.upstreamAttrs)
                tuple.addOrOverwriteTag(step.tuple.getAttr(attr));
             return tuple;
        });

        const upstreamData = step.query(upstreamQuery);

        const out = new Stream();

        upstreamData.transform(out, data => {
            const obj = JSON.parse(data.contents);
            const target = new AddressableObject(obj, this.path);
            return { target, upstreamQuery };
        });

        return out;
    }

    performGet(step: Task) {
        this.loadObjects(step)
        .transform(step.output, ({ target, upstreamQuery}) => {
            const targetValue = target.get();

            let keys = [];

            if (step.hasValue(this.mainKeyAttr)) {
                keys = [step.get(this.mainKeyAttr)];
            } else {
                keys = Object.keys(targetValue);
            }

            const outputs = [];
            for (const key of keys) {
                const foundValue = targetValue[key];
                if (foundValue === undefined)
                    continue;

                const outputItem = {};
                outputItem[this.mainKeyAttr] = key;

                if (typeof foundValue === 'object') {
                    for (const output of this.outputAttrs) {
                        outputItem[output] = foundValue[output];
                    }
                } else {
                    if (this.outputAttrs.length !== 1) {
                        throw new Error("JSON element has one value but the accessor was mounted with multiple outputAttrs"
                                        +`\n Mount func = (${this.config.func})`
                                        +`\n Output attrs = (${this.outputAttrs})`)
                    }

                    outputItem[this.outputAttrs[0]] = foundValue;
                }

                outputs.push(outputItem);
            }

            return outputs;
        });
    }

    performPut(step: Task) {
        this.loadObjects(step)
        .streamingTransform(step.output, ({ target, upstreamQuery }: { target: AddressableObject, upstreamQuery: Query }) => {
            const key = step.get(this.mainKeyAttr);
            const targetValue = target.get();

            const existingValue = targetValue[key];

            if (typeof existingValue === 'object') {
                for (const output of this.outputAttrs) {
                    existingValue[output] = step.get(output);
                }
            } else {
                if (this.outputAttrs.length !== 1) {
                    throw new Error("JSON data has a singular value but the accessor was mounted with multiple outputAttrs: " + this.config.func);
                }

                targetValue[key] = step.get(this.outputAttrs[0]);
            }

            target.set(targetValue);

            // TODO: This probably doesn't work great if the query has multiple steps.
            const putQuery = upstreamQuery.convertToPut();
            putQuery.remapTuples(tuple => {
                 tuple.addOrOverwriteTag({ t: 'tag', attr: 'contents', value: { t: 'str_value', str: JSON.stringify(target.root, null, 2) }})
                 return tuple
            });
            return step.query(putQuery);
        })
    }
}

export function getJsonMount(config: Config): MountPointSpec[] {
    const mount = new JsonMount(config);

    return [ mount.getSpec, mount.putSpec ];
}

if (require.main === module) {
    runCommandLineProcess({
        setupGraph(graph) {
            graph.mount(getJsonMount({
                fetchJson: 'fs $filename contents',
                upstreamAttrs: ['filename'],
                func: '$filename a -> b',
            }));
        }
    });
}
