
import { recordUnhandledException } from '../FailureTracking'

interface Config {
    periodMs: number
    minTimeBetweenRunsMs?: number
    callback: () => void
}

export class RecurringCallback {

    config: Config
    timer = null
    isDuringCall = false;
    needCallAfterMinTime = false;

    constructor(config: Config) {
        this.config = config;
    }

    start() {
        if (!this.timer && !this.isDuringCall) {
            this.timer = setTimeout(() => { this.onCallbackTime() }, this.config.periodMs);
        }
    }

    async onCallbackTime() {
        this.timer = null;

        this.isDuringCall = true;
        this.needCallAfterMinTime = false;
        const startTime = Date.now();

        try {
            await this.config.callback();
        } catch (e) {
            recordUnhandledException(e);
        }

        this.isDuringCall = false;

        const duration = Date.now() - startTime;
        let tillNext = this.config.periodMs - duration;

        if (tillNext < 0)
            tillNext = 1;

        if (this.config.minTimeBetweenRunsMs) {
            if (tillNext < this.config.minTimeBetweenRunsMs)
                tillNext = this.config.minTimeBetweenRunsMs;

            if (this.needCallAfterMinTime) {
                this.needCallAfterMinTime = false;
                tillNext = this.config.minTimeBetweenRunsMs;
            }
        }

        this.timer = setTimeout(() => { this.onCallbackTime() }, tillNext);
    }
}
