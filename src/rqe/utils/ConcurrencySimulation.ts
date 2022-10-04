
import { Stream } from '../Stream'
import { Item } from '../Item'

interface ManagedStream {
    index: number
    spec: string
    steps: StreamStep[]
    stream: Stream
}

interface StreamStep {
    timing: string
    contents: string
    stepIndex: number
}

class StepIterator {
    stepIndex: number = 0
    stepCount: number = 0
    currentTiming: string = 'i'
    currentStreamIndex: number = 0
    streams: ManagedStream[]

    constructor(streams: ManagedStream[]) {
        this.streams = streams;

        for (const stream of this.streams) {
            if (stream.steps.length > this.stepCount)
                this.stepCount = stream.steps.length;
        }
    }

    advance() {
        this.currentStreamIndex++;

        if (this.currentStreamIndex >= this.streams.length) {
            // advance to next timing
            this.currentStreamIndex = 0;

            // i -> h -> o -> next
            switch (this.currentTiming) {
            case 'i':
                this.currentTiming = 'h';
                break;
            case 'h':
                this.currentTiming = 'o';
                break;
            default:
                // advance to next step.
                this.currentTiming = 'i';
                this.stepIndex++;
            }
        }
    }

    matchingStep() {
        const stream = this.streams[this.currentStreamIndex];
        const step = stream.steps[this.stepIndex];
        if (!step)
            return null;

        if (step.timing === this.currentTiming) {
            return { stream, step };
        }

        return null;
    }

    stepCausesInterrupt() {
        return this.currentTiming === 'h' || this.currentTiming === 'o';
    }

    done() {
        return this.stepIndex >= this.stepCount;
    }
}

export class ConcurrencySimulation {

    spec: string
    streams: ManagedStream[] = []
    combined = new Stream();

    constructor(spec: string) {
        this.spec = spec;

        const streamStrs = spec.split(',');

        for (const streamStr of streamStrs) {

            let stepStrs = streamStr.split(' ').filter(item => !!item);

            const steps: StreamStep[] = [];

            for (const stepStr of stepStrs) {
                steps.push({
                    timing: stepStr[0],
                    contents: stepStr[1] || '1',
                    stepIndex: steps.length,
                });
            }

            this.streams.push({
                index: this.streams.length,
                spec,
                steps,
                stream: new Stream()
            });
        }
    }

    /*
       Return the expect results from running all the streams.

       Note that the result order may be different than what you get from run(),
       because of timing. If you sort the items on 'stream' then it should line up.
    */
    getExpectedResults(): Item[] {

        const out = new Stream();
        for (const stream of this.streams)
            for (const step of stream.steps)
                switch (step.contents) {
                case '1':
                    out.put({ data: step.stepIndex, stream: stream.index });
                }

        out.done();

        return out.sync().list();
    }

    doStep(it: StepIterator) {
        if (it.done()) {
            this.combined.done();
            return;
        }

        while (!it.done()) {
            const match = it.matchingStep();

            if (!match) {
                it.advance();
                continue;
            }

            switch (match.step.contents) {
            case 'd':
                match.stream.stream.done();
                break;
            case '1':
                const item = { data: match.step.stepIndex, stream: match.stream.index };
                match.stream.stream.put(item);
                this.combined.put(item);
                break;
            }

            if (it.stepCausesInterrupt()) {
                it.advance();
                setTimeout(() => this.doStep(it), 0);
                return;
            } else {
                it.advance();
                continue;
            }
        }

        this.combined.done();
    }

    run() {
        const it = new StepIterator(this.streams);
        this.doStep(it);
    }

    stream(i: number) {
        return this.streams[i].stream;
    }
}

interface ScrambleOptions {
    numStreams: number
}

function repeat(s: string, joiner: string, times: number) {
    let items = [];
    for (let i=0; i < times; i++)
        items.push(s);
    return items.join(joiner);
}

function* scrambleSpecs(opts: ScrambleOptions) {
    // Immediate-timing variations.
    for (let i=0; i < opts.numStreams; i++) {
    }
}

// Spec definition:
//
// Timing code:
//
//   i - immediate     (gets run first in a step, with no interrupt)
//   h - high priority (runs after 'i', and do an interrupt after)
//   o - low priority  (runs after 'h', and do an interrupt after)
//   s - skip          (do nothing)

// Content code:
//   1 - send 1 item
//   d - send done
