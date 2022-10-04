
import Token from './Token'
import unescape from './unescape'
import { t_quoted_string, t_space, t_newline } from './tokens'
import { ModifiedLexedText } from './ModifiedLexedText'

export class LexedText {
    tokens: Token[]
    originalStr: string

    constructor(originalStr: string) {
        this.originalStr = originalStr;
    }

    getTokenText(token: Token) {
        return this.originalStr.slice(token.startPos, token.endPos);
    }

    getUnquotedText(token: Token) {
        if (token.match === t_quoted_string) {
            const str = this.originalStr.slice(token.startPos + 1, token.endPos - 1);
            return unescape(str);
        }

        return this.getTokenText(token);
    }

    tokenCharIndex(tokenIndex: number) {
        if (tokenIndex >= this.tokens.length)
            return this.originalStr.length;

        return this.tokens[tokenIndex].startPos;
    }

    startCharOfToken(tokenIndex: number) {
        if (tokenIndex >= this.tokens.length)
            return this.originalStr.length;

        return this.tokens[tokenIndex].startPos;
    }

    endCharOfToken(tokenIndex: number) {
        if (tokenIndex >= this.tokens.length)
            return this.originalStr.length;

        return this.tokens[tokenIndex].endPos;
    }

    getTextRange(startPos: number, endPos: number) {
        let out = '';

        for (let i = startPos; i < endPos; i++)
            out += this.getTokenText(this.tokens[i]);

        return out;
    }

    stripSpacesAndNewlines() {
        this.tokens = this.tokens.filter(tok => {
            if (tok.match === t_space)
                return false;
            if (tok.match === t_newline)
                return false;
            return true;
        });
    }

    startModifying() {
        return new ModifiedLexedText(this);
    }

    toDebugDump() {
        let out = [];

        for (const token of this.tokens) {
            let text = this.getTokenText(token);
            text = text.replace('\n', '\\n');
            out.push(`${token.match.name}: startPos=${token.startPos} endPos=${token.endPos} text=${text}`)
        }

        return out.join('\n')
    }
}
