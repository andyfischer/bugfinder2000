
import { t_space } from './tokens'
import { Token } from '.'
import TokenDef from './TokenDef'
import { LexerSettings } from './LexerSettings'

const c_newline = '\n'.charCodeAt(0);

interface BracketFrame {
    startedAtIndex: number
    lookingFor: string
}

export default class Context {
    str: string
    index = 0
    tokenIndex = 0
    isIterator = true
    lineNumber = 1
    charNumber = 1
    leadingIndent = 0
    resultTokens: Token[] = []
    bracketStack: BracketFrame[] = []
    settings: LexerSettings

    constructor(str: string, settings: LexerSettings) {
        if (typeof str !== 'string')
            throw new Error('expected string, saw: ' + str);

        this.str = str;
        this.settings = settings;
    }

    finished(lookahead: number = 0) : boolean {
        return (this.index + lookahead) >= this.str.length;
    }

    next(lookahead:number = 0) {
        if ((this.index + lookahead) >= this.str.length)
            return 0;

        return this.str.charCodeAt(this.index+lookahead);
    }

    nextChar(lookahead: number = 0) {
        if (this.index+lookahead >= this.str.length)
            return null;

        return this.str[this.index+lookahead];
    }

    position() {
        return this.index;
    }

    getTokenText(token: Token) {
        return this.str.substr(token.startPos, token.endPos - token.startPos);
    }

    consume(match: TokenDef, len: number) {

        // update leadingIndent
        if (match === t_space && this.charNumber === 1)
            this.leadingIndent = len;

        const result:Token = {
            match: match,
            length: len,
            tokenIndex: this.tokenIndex,
            startPos: this.index,
            endPos: this.index + len,
            lineStart: this.lineNumber,
            columnStart: this.charNumber,
            leadingIndent: this.leadingIndent
        };

        // update bracket stack
        if (match.bracketSide === 'left') {
            this.bracketStack.push({
                startedAtIndex: this.tokenIndex,
                lookingFor: match.bracketPairsWith
            });
        }

        if (match.bracketSide === 'right') {
            const lookingFor = (this.bracketStack.length > 0)
                && this.bracketStack[this.bracketStack.length - 1].lookingFor;

            if (match.name !== lookingFor) {
                // Closing bracket doesn't match opening bracket. TODO, save as an error.
            } else {

                const leftSideIndex = this.bracketStack[this.bracketStack.length - 1].startedAtIndex;
                const rightSideIndex = this.tokenIndex;

                result.pairsWithIndex = leftSideIndex;
                this.resultTokens[leftSideIndex].pairsWithIndex = rightSideIndex;

                this.bracketStack.pop();
            }
        }

        // update lineNumber & charNumber
        if (this.next(0) === c_newline) {
            this.lineNumber += 1;
            this.charNumber = 1;
        } else {
            this.charNumber += len;
        }

        this.tokenIndex += 1;
        this.index = result.endPos;

        return result;
    }

    consumeWhile(match: TokenDef, matcher: (c: number) => boolean) {
        let len = 0;
        while (matcher(this.next(len)) && this.next(len) !== 0)
            len += 1;
        return this.consume(match, len);
    }
}
