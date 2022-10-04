
import { IDSource } from './IDSource'

interface Options {
    ts?: boolean
}

export class CodeStringBuilder {
    options: Options
    lines: string[] = []
    indentLevel: number = 0
    nextLocal = new IDSource('local_');

    constructor(options: Options = {}) {
        this.options = options;
    }

    ts(s: string) {
        if (this.options.ts)
            return s;
        return '';
    }

    indent(): string {
        return '  '.repeat(this.indentLevel);
    }

    comment(s: string) {
        this.line('// ' + s);
    }

    openBlock(...strs: string[]) {
        this.lines.push(this.indent() + strs.flat(10).join(''));
        this.indentLevel += 1;
    }

    closeBlock(...strs: string[]) {
        this.indentLevel -= 1;
        this.lines.push(this.indent() + strs.flat(10).join(''));
    }

    line(...strs: Array<string | string[]>) {
        this.lines.push(this.indent() + strs.flat(10).join(''));
    }

    str() {
        return this.lines.join('\n');
    }
}

