
export interface Span {
    setTag: (tag: string, value: any) => void
    log: (attrs: any) => void
    finish: () => void
    context: () => any
}

export class NullSpan implements Span {
    setTag() {}
    log() {}
    finish() {}
    context() { return {} }
}

export interface TraceService {
    startSpan: (name: string, attrs: any) => Span
}