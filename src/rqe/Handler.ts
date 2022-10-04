
import { TaggedValue } from './TaggedValue'
import { lexStringToIterator } from './lexer'
import { parseTableDeclFromTokensV2 } from './parser/parseTableDecl'
import { MountPointSpec, pointSpecToDeclString } from './MountPoint'
import { getHandlerWithJavascriptMagic } from './JavascriptMagic'
import { QueryTuple, QueryTag } from './QueryTuple'
import { Task } from './Step'

export type HandlerCallback = (ctx: Task) => void | Promise<any>

export interface HandlerTag {
    attr: string
    required?: boolean
    requiresValue?: boolean
    specificValue?: TaggedValue
    assumeInclude?: boolean
    isOutput?: boolean
}

export interface PrecompiledHandlerImpl {
    t: 'precompiledHandlerImpl'
    decl: string
    callback: HandlerCallback
}

export class Handler {
    t: 'handler' = 'handler'

    tags: HandlerTag[]
    run: HandlerCallback
    byAttr: Map<string,number>

    constructor(tags: HandlerTag[]) {
        this.tags = tags;
        this.rebuildByAttrMap();
    }

    rebuildByAttrMap() {
        this.byAttr = new Map();

        for (let i = 0; i < this.tags.length; i++) {
            const tag = this.tags[i];
            if (this.byAttr.has(tag.attr))
                throw new Error("duplicate attr: " + tag.attr);
            this.byAttr.set(tag.attr, i);
        }
    }

    has(attr: string) {
        return this.byAttr.has(attr);
    }

    without(attr: string) {
        const tags = this.tags.filter(tag => tag.attr !== attr);
        return new Handler(tags);
    }

    withParameter(attr: string) {
        return new Handler(
            this.tags.concat([ { attr, requiresValue: true } ])
        );
    }

    withCallback(callback: HandlerCallback) {
        const out = new Handler(this.tags);
        out.run = callback;
        return out;
    }

    toQuery(): QueryTuple {
        const queryTags: QueryTag[] = this.tags.map(tag => {
            return {
                t: 'tag',
                attr: tag.attr,
                value: { t: 'no_value' }, // todo: should probably copy tag.specificValue
                identifier: tag.requiresValue ? tag.attr : null,
            }
        });

        return new QueryTuple(queryTags);
    }

    toDeclString() {
        return pointSpecToDeclString(this.toSpec());
    }

    toSpec(): MountPointSpec {
        const out: MountPointSpec = {
            t: 'mountPointSpec',
            run: this.run,
            attrs: {}
        }

        for (const tag of this.tags) {
            out.attrs[tag.attr] = tag;
        }

        return out;
    }
}

export function parseHandler(str: string | Handler, callback?: Function): Handler {

    if ((str as Handler).t === 'handler')
        return str as Handler;

    str = str as string;

    if (str.startsWith('[v2]')) {
        str = str.replace('[v2]','');
    }

    const it = lexStringToIterator(str);
    const result = parseTableDeclFromTokensV2(it);

    if (result.t === 'parseError') {
        throw new Error(`parse error on "${str}": ` + result);
    }

    const tags: HandlerTag[] = [];

    for (const [key,value] of Object.entries(result.attrs)) {
        tags.push({
            attr: key,
            ...value,
        });
    }

    const handler = new Handler(tags);
    if (callback)
        handler.run = getHandlerWithJavascriptMagic(callback);

    return handler;
}
