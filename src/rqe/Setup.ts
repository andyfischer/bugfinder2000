
import { Task } from './Step'
import { QueryLike } from './Query'
import { TableImplementationError } from './Errors'
import { Item } from './Item'
import { parseTableDecl } from './parser/parseTableDecl'
import { MountPointSpec, MountAttr } from './MountPoint'
import { Stream } from './Stream'
import { HandlerCallback } from './Handler'

export type ItemCallback = (item: Item, ctx?: Task) => null | void | Item | Item[] | Promise<Item | Item[]> | Stream

export interface LooseBindParams {
    attrs?: string | string[] | { [attr: string]: MountAttr }
    name?: string
    run?: HandlerCallback
}

export function toMountSpec(looseSpec: LooseBindParams): MountPointSpec {
    const attrs: { [attr: string]: MountAttr } = {};

    const result: MountPointSpec = {
        name: looseSpec.name,
        attrs: {},
        run: looseSpec.run,
    }

    if (typeof looseSpec.attrs === 'string') {
        result.attrs[looseSpec.attrs] = { required: true };
    } else if (Array.isArray(looseSpec.attrs)) {
        for (const attr of looseSpec.attrs)
            result.attrs[attr] = { required: true };
    } else {
        result.attrs = looseSpec.attrs;
    }

    return result;
}

export class Setup {

    attrs: { [attr: string]: MountAttr } = {}
    _tableName: string
    aliasQuery: QueryLike
    runCallback: HandlerCallback
    parent: Setup
    children: Setup[] = []

    bind(looseSpec: LooseBindParams) {

        if (typeof looseSpec !== 'object')
            throw new TableImplementationError('table() expected object input');

        const spec = toMountSpec(looseSpec);
        const child = new Setup();
        child.parent = this;
        child.attrs = {}

        const { name, attrs } = spec;

        if (name) {
            child.tableName(name);
        }

        for (const [ attr, attrConfig ] of Object.entries(attrs)) {
            child.attrs[attr] = attrConfig;
        }

        for (const [ attr, attrConfig ] of Object.entries(child.attrs)) {
            if (attrConfig.assumeInclude && attrConfig.required) {
                throw new Error("attr should not be assumeInclude=true and required=true");
            }

            if (attrConfig.assumeInclude)
                attrConfig.required = false;

            if (attrConfig.required == undefined)
                attrConfig.required = true;
        }

        this.children.push(child);

        if (spec.run) {
            child.runCallback = spec.run;
        }

        return child;
    }

    table(params: LooseBindParams) {
        return this.bind(params);
    }

    mount(decl: string, callback: HandlerCallback) {
        const bind = toTableBind(decl, callback);
        this.bind(bind);
    }

    tableName(name: string) {
        this._tableName = name;
        return this;
    }

    get(callback: HandlerCallback) {
        if (this.runCallback) {
            throw new Error("already have a 'run' callback");
        }

        this.runCallback = callback;
        return this;
    }

    run(callback: HandlerCallback) {
        if (this.runCallback) {
            throw new Error("already have a 'run' callback");
        }

        this.runCallback = callback;
        return this;
    }

    put(callback: HandlerCallback) {
        const subTable = this.table({ attrs: { put: {} }});
        return subTable.get(callback);
    }

    getAttrsWithInherited() {
        const result: { [attr: string]: MountAttr } = {};

        for (const [key,value] of Object.entries(this.attrs))
            result[key] = value;

        let parent = this.parent;

        let recursionLimit = 1000;

        while (parent) {
            if (recursionLimit-- <= 0)
                throw new Error("internal error: too many loops in getAttrsWithInherited");

            for (const [ attr, attrConfig ] of Object.entries(parent.attrs)) {
                if (!result[attr])
                    result[attr] = { ...attrConfig };
            }

            parent = parent.parent;
        }

        return result;
    }

    *iterateChildren(): IterableIterator<Setup> {
        yield this;

        for (const child of this.children) {
            yield* child.iterateChildren();
        }
    }

    toSpecs() {
        const result: MountPointSpec[] = []

        for (const child of this.iterateChildren()) {
            if (child.runCallback) {

                result.push({
                    attrs: child.getAttrsWithInherited(),
                    name: child._tableName,
                    run: child.runCallback
                });
            }
        }

        return result;
    }
}

function toList(s: string | string[]) {
    if (Array.isArray(s))
        return s;
    return [s];
}

export function toTableBind(decl: string, callback: HandlerCallback): MountPointSpec {
    const params = parseTableDecl(decl);
    params.run = callback;
    return params;
}
