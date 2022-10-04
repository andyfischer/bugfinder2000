
import { TokenIterator, lexStringToIterator, t_right_arrow, t_colon } from '../lexer'
import { MountPointSpec, MountAttr } from '../MountPoint'
import { ParseError } from './ParseError'
import { parseQueryTagFromTokens } from './parseQueryTag'
import { QueryTag } from '../QueryTuple'

export function parseTableDeclFromTokens(it: TokenIterator): MountPointSpec | ParseError {
    const out: MountPointSpec = {
        t: 'mountPointSpec',
        attrs: {},
    };

    let hasSeenArrow = false;

    while (!it.finished()) {
        it.skipSpaces();

        if (it.finished())
            break;

        if (it.tryConsume(t_right_arrow)) {
            hasSeenArrow = true;
            continue;
        }

        if (it.tryConsume(t_colon)) {
            // Everything on the left side is a namespace.
            for (const config of Object.values(out.attrs))
                config.requiresValue = false;
            continue;
        }

        const tag: QueryTag = parseQueryTagFromTokens(it);

        if (tag.specialAttr)
            throw new Error("star not supported in table decl");

        const resultAttr: MountAttr = {
            required: !hasSeenArrow,
            requiresValue: !hasSeenArrow,
        };

        out.attrs[tag.attr] = resultAttr;

        if (tag.value.t !== 'no_value') {
            if (hasSeenArrow)
                throw new Error("can't add tags with values after ->");

            resultAttr.specificValue = tag.value;
            resultAttr.requiresValue = false;
        }
    }

    return out;
}

export function parseTableDeclFromTokensV2(it: TokenIterator): MountPointSpec | ParseError {
    const out: MountPointSpec = {
        t: 'mountPointSpec',
        attrs: {},
    };

    let hasSeenArrow = false;

    while (!it.finished()) {
        it.skipSpaces();

        if (it.finished())
            break;

        if (it.tryConsume(t_right_arrow)) {
            hasSeenArrow = true;
            continue;
        }

        const tag: QueryTag = parseQueryTagFromTokens(it);

        if (tag.specialAttr)
            throw new Error("star not supported in table decl");

        const resultAttr: MountAttr = {
            required: !tag.isOptional && !hasSeenArrow,
            requiresValue: (tag.identifier != null) && !hasSeenArrow,
            isOutput: hasSeenArrow,
        };

        if (tag.attr === ":") 
            throw new Error("colon not supported in table decl: " + it.sourceText?.originalStr);

        out.attrs[tag.attr] = resultAttr;

        if (tag.value.t !== 'no_value') {
            resultAttr.specificValue = tag.value;
            resultAttr.requiresValue = false;
        }
    }

    return out;
}

export function parseTableDecl(str: string | MountPointSpec): MountPointSpec {

    if ((str as MountPointSpec).t === 'mountPointSpec')
        return str as MountPointSpec;

    str = str as string;

    if (str.indexOf('[v2]') !== -1)
        console.warn("you can remove [v2]: " + str);

    str = str.replace('[v2]','');

    const it = lexStringToIterator(str);
    const result = parseTableDeclFromTokensV2(it);

    if (result.t === 'parseError') {
        throw new Error(`parse error on "${str}": ` + result);
    }

    return result;
}
