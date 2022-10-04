
import { Table } from '../Table'
import { Task } from '../Step'
import { MountPointSpec, MountAttr } from '../MountPoint'
import { QueryTuple } from '../QueryTuple'
import { updateItemUsingQuery } from '../Update'
import { parseHandler } from '../Handler'
import { parseTableDecl } from '../parser/parseTableDecl'

export interface TableMountConfig {
    readonly?: boolean
    mountAs?: string
}

export function getTableMount(table: Table, opts: TableMountConfig = {}): MountPointSpec[] {
    
    const schema = table.schema;
    const readonly = !!opts.readonly;
    
    if (schema.attrs.length === 0)
        return [];

    let commonAttrs: { [attr:string]: MountAttr } = {};

    for (const [attr, config] of Object.entries(schema.attrs)) {
        let required = config.required !== false;

        if (config.generate)
            required = false;

        commonAttrs[attr] = { required, requiresValue: false, acceptsValue: true, isOutput: true };
    }

    // Parse mountAs and add those to commonAttrs.
    let mountAsAttrs: { [attr:string]: MountAttr } = {};

    if (schema.mountAs) {
        const mountAs = parseHandler(schema.mountAs);
        for (const tag of mountAs.tags) {
            mountAsAttrs[tag.attr] = tag;
        }
    }

    if (opts.mountAs) {
        const mountAs = parseHandler(opts.mountAs);
        for (const tag of mountAs.tags) {
            mountAsAttrs[tag.attr] = tag;
        }
    }

    const getHandler = (step: Task) => {

        let filter = null;

        for (const tag of step.tuple.tags) {
            if (tag.attr && tag.value.t === 'str_value') {
                filter = filter || {};
                filter[tag.attr] = tag.value.str;
            }
        }

        const items = filter === null ? table.scan() : table.where(filter);

        for (const item of items) {
            step.put(item);
        }
    };

    function updateBinding(basedOn: MountPointSpec): MountPointSpec {
        let attrs = {};

        for (const [ attr, basedOnAttr ] of Object.entries(basedOn.attrs)) {
            attrs[attr] = { ...basedOnAttr, requiresValue: false, acceptsValue: true };
        }

        return {
            attrs: {
                ...attrs,
                'update!': { required: true },
            },
            run: (step: Task) => {

                let filter = null;
                const updateBody = step.tuple.getAttr('update!').value as QueryTuple;

                for (const tag of step.tuple.tags) {
                    if (tag.attr === "update!")
                        continue;
                    if (tag.attr && tag.value.t === 'str_value') {
                        filter = filter || {};
                        filter[tag.attr] = tag.value.str;
                    }
                }

                table.update(filter, item => {
                    updateItemUsingQuery(step.graph, item, updateBody);
                });
            }
        }
    }

    function deleteBinding(basedOn: MountPointSpec): MountPointSpec {
        let attrs = {};

        for (const [ attr, basedOnAttr ] of Object.entries(basedOn.attrs)) {
            attrs[attr] = { ...basedOnAttr, requiresValue: false, acceptsValue: true };
        }
        
        return {
            attrs: {
                ...attrs,
                'delete!': { required: true },
            },
            run: (step: Task) => {
                let filter = null;

                for (const tag of step.tuple.tags) {
                    if (tag.attr === "delete!")
                        continue;
                    if (tag.attr && tag.value.t === 'str_value') {
                        filter = filter || {};
                        filter[tag.attr] = tag.value.str;
                    }
                }

                table.delete(filter);
            },
        };
    }

    const points: MountPointSpec[] = [];

    // Default bind(s) with all attrs.
    const defaultGet: MountPointSpec = {
        attrs: {
            ...mountAsAttrs,
            ...commonAttrs,
        },
        name: schema.name || null,
        run: getHandler,
    };

    points.push(defaultGet);

    if (!readonly) {
        let attrs = {
            ...mountAsAttrs,
            ...commonAttrs,
        };

        for (const [ attr, basedOnAttr ] of Object.entries(attrs)) {
            attrs[attr] = { ...basedOnAttr, requiresValue: false, acceptsValue: true };
        }
      const put: MountPointSpec = {
        attrs: {
            ...mountAsAttrs,
            ...commonAttrs,
            'put!': { required: true },
        },
        run: (step: Task) => {
            const item = step.args();
            delete item['put!'];
            table.put(item);
        }
      };

      points.push(put);
      points.push(updateBinding(defaultGet));
      points.push(deleteBinding(defaultGet));
    }

    // Listener stream
    points.push({
        attrs: {
            ...mountAsAttrs,
            ...commonAttrs,
            'listener-stream': { required: true },
        },
        run(step: Task) {
            const stream = table.startListenerStream(step);
            step.output.put({ 'listener-stream': stream });
            step.output.close();
        }
    });

    if (schema.mountAs) {
        // Listener stream with just the mountAs
        points.push({
            attrs: {
                ...mountAsAttrs,
                'listener-stream': { required: true },
            },
            run(step: Task) {
                const stream = table.startListenerStream(step);
                step.output.put({ 'listener-stream': stream });
                step.output.close();
            }
        });
    }

    // Add binds for every declared func.
    for (const decl of schema.funcs || []) {
        const parsedMount = parseTableDecl(decl);
        parsedMount.run = getHandler;

        // Assume inputs are required
        for (const attrConfig of Object.values(parsedMount.attrs))
            attrConfig.requiresValue = attrConfig.requiresValue || !attrConfig.isOutput;

        parsedMount.attrs = {
            ...mountAsAttrs,
            ...parsedMount.attrs,
        }

        // Add the other attrs as possible outputs.
        for (const [ attr, config ] of Object.entries(schema.attrs)) {
            if (!parsedMount.attrs[attr]) {
                parsedMount.attrs[attr] = { required: false };
            }
        }

        points.push(parsedMount);

        if (!readonly) {
            points.push(updateBinding(parsedMount));
            points.push(deleteBinding(parsedMount));
        }
    }

    return points;
}
