
export class IndentPrinter {
    indentLevel = 0
    logFunc = console.log

    log(...args: string[]) {
        let finalArgs = [];
        for (let i=0; i < this.indentLevel; i++)
            finalArgs.push('  ');
        finalArgs = finalArgs.concat(args);
        this.logFunc.apply(null, finalArgs);
    }

    indent() {
        this.indentLevel++;
    }

    unindent() {
        this.indentLevel--;
    }
}
