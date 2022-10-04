
export class IDSourceNumber {
    next: number = 1;

    copyFrom(source: IDSourceNumber) {
        this.next = source.next;
    }

    take() {
        const out = this.next;
        this.next++;
        return out;
    }
}

export class IDSource {
    prefix: string;
    next: number = 1;

    constructor(prefix: string = '') {
        this.prefix = prefix;
    }

    take(): string {
        const result = this.prefix + this.next + '';
        this.next += 1;
        return result;
    }
}
