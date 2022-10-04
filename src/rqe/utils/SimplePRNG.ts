
export class SimplePRNG {
    seed: number

    constructor(seed: number) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0)
            this.seed += 2147483646;
    }

    next(max: number) {
        const out = this.seed % max;
        this.seed = this.seed * 16807 % 2147483647;
    }
}

