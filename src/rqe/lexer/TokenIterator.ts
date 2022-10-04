
import { Token, LexedText, t_space, t_newline, t_ident } from '.'
import SourcePos from './SourcePos'
import TokenDef from './TokenDef'
import { LexerSettings } from './LexerSettings'

export class TokenIterator {

    position: number = 0
    tokens: Token[]
    sourceText?: LexedText
    settings: LexerSettings

    constructor(text: LexedText, settings: LexerSettings = {}) {
        this.tokens = text.tokens;
        this.sourceText = text;
        this.settings = settings;

        this.autoSkip();
    }

    getPosition() {
        return this.position;
    }

    restore(position: number) {
        this.position = position;
    }

    copy() {
        const it = new TokenIterator(this.sourceText);
        it.position = this.position;
        return it;
    }

    next(lookahead: number = 0): Token {
        const pos = this.position + lookahead;

        if (pos < 0) {
            return {
                startPos: 0,
                endPos: 0,
                tokenIndex: 0,
                length: 0,
                lineStart: 0,
                columnStart: 0,
                leadingIndent: 0,
                match: null
            }
        }

        if (pos >= this.tokens.length) {
            const lastToken = this.tokens[this.tokens.length - 1];
            if (!lastToken) {
                return {
                    startPos: 0,
                    endPos: 0,
                    tokenIndex: -1,
                    length: 0,
                    lineStart: 0,
                    columnStart: 0,
                    leadingIndent: 0,
                    match: null
                }
            }
            return {
                startPos: lastToken.endPos,
                endPos: lastToken.endPos,
                tokenIndex: -1,
                length: 0,
                lineStart: lastToken.lineStart,
                columnStart: lastToken.columnStart + lastToken.length,
                leadingIndent: lastToken.leadingIndent,
                match: null
            }
        }

        return this.tokens[pos];
    }

    nextIs(match: TokenDef, lookahead: number = 0): boolean {
        const token = this.next(lookahead);
        return token.match === match;
    }

    nextText(lookahead: number = 0): string {
        const token = this.next(lookahead);
        return this.sourceText.getTokenText(token);
    }

    nextIsIdentifier(str: string, lookahead: number = 0): boolean {
        return this.nextIs(t_ident, lookahead) && this.nextText(lookahead) === str;
    }

    nextUnquotedText(lookahead: number = 0): string {
        const token = this.next(lookahead);
        return this.sourceText.getUnquotedText(token);
    }

    nextLength(lookahead: number = 0): number {
        const token = this.next(lookahead);
        return token.endPos - token.startPos;
    }

    finished(lookahead: number = 0): boolean {
        return (this.position + lookahead) >= this.tokens.length;
    }

    advance() {
        this.position += 1;

        this.autoSkip();
    }

    jumpTo(pos: number) {
        this.position = pos;

        this.autoSkip();
    }

    consume(match: TokenDef = null) {
        if (match !== null && !this.nextIs(match))
            throw new Error(`expected token: ${match?.name}, found: ${this.next().match?.name} (${this.nextText()})`);

        this.advance();
    }

    consumeWhile(condition: (next: Token) => boolean) {
        while (!this.finished() && condition(this.next()))
            this.advance();
    }

    consumeIdentifier(s: string) {
        if (!this.nextIsIdentifier(s)) {
            throw new Error(`consume expected identifier: "${s}, found: ${this.nextText()}`);
        }

        this.advance();
    }

    consumeAsText(lookahead: number = 0): string {
        const str = this.nextText(lookahead);
        this.consume();
        return str;
    }

    consumeAsUnquotedText(lookahead: number = 0): string {
        const str = this.nextUnquotedText(lookahead);
        this.consume();
        return str;
    }

    consumeAsTextWhile(condition: (next: Token) => boolean) {
        let str = '';
        let stuckCounter = 0;

        while (!this.finished() && condition(this.next())) {
            str += this.consumeAsText();
            stuckCounter += 1;
            if (stuckCounter > 10000) {
                throw new Error("infinite loop in consumeAsTextWhile?")
            }
        }

        return str;
    }

    tryConsume(match: TokenDef): boolean {
        if (this.nextIs(match)) {
            this.consume();
            return true;
        }
        return false;
    }

    skipWhile(condition: (next: Token) => boolean) {
        while (condition(this.next()) && !this.finished())
            this.consume();
    }

    skipUntilNewline() {
        this.skipWhile(token => token.match !== t_newline);
        if (this.nextIs(t_newline))
            this.consume();
    }

    autoSkip() {
        if (!this.settings.autoSkipSpaces && !this.settings.autoSkipNewlines)
            return;

        while (true) {
            if (this.settings.autoSkipSpaces && this.nextIs(t_space))
                this.consume(t_space);
            else if (this.settings.autoSkipNewlines && this.nextIs(t_newline))
                this.consume(t_newline);
            else break;
        }
    }

    skipSpaces() {
        while (this.nextIs(t_space))
            this.consume(t_space);
    }

    skipNewlines() {
        while (this.nextIs(t_space) || this.nextIs(t_newline))
            this.consume();
    }

    lookaheadSkipSpaces(lookahead: number = 0) {
        while (this.nextIs(t_space, lookahead))
            lookahead++;
        return lookahead;
    }

    lookaheadAdvance(lookahead: number) {
        lookahead++;
        if (this.nextIs(t_space, lookahead))
            lookahead++;
    }

    consumeSpace() {
        while (this.nextIs(t_space))
            this.consume(t_space);
    }

    consumeWhitespace() {
        while (this.nextIs(t_space) || this.nextIs(t_newline))
            this.consume();
    }

    toSourcePos(firstToken: Token, lastToken: Token): SourcePos {
        return {
            posStart: firstToken.startPos,
            posEnd: lastToken.endPos,
            lineStart: firstToken.lineStart,
            columnStart: firstToken.columnStart,
            lineEnd: firstToken.lineStart,
            columnEnd: lastToken.columnStart + lastToken.length
        }
    }

    spanToString(startPos: number, endPos: number) {

        const startToken = this.tokens[startPos];
        const endToken = this.tokens[endPos];

        return this.sourceText.originalStr.slice(startToken.startPos, endToken.endPos);
    }
}
