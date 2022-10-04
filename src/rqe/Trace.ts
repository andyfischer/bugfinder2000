
import { Query, QueryLike, toQuery, QueryParameters } from './Query'
import { toStructuredString } from './Debug'

interface Event {
    t: 'event' | 'open' | 'close'
    data: Query
}

let _nextTraceId = 1;

export class Trace {
    log: Event[] = []
    stack: Query[] = []
    id: number

    constructor() {
        this.id = _nextTraceId;
        _nextTraceId++;
    }

    event(evt: QueryLike, params?: QueryParameters) {
        let data = toQuery(evt);
        if (params)
            data = data.injectParameters(params);
        this.log.push({ t: 'event', data });
    }

    open(evt: QueryLike, params?: QueryParameters) {
        let data = toQuery(evt);
        if (params)
            data = data.injectParameters(params);
        this.stack.push(data);
        this.log.push({ t: 'open', data });
    }

    close(evt: QueryLike, params?: QueryParameters) {
        let data = toQuery(evt);
        if (params)
            data = data.injectParameters(params);
        this.stack.pop();
        this.log.push({ t: 'close', data });
    }

    str() {
        let out = [];
        let indentLevel = 0;

        function printIndent() {
            for (let i=0; i < indentLevel; i++)
                out.push('  ');
        }

        for (const event of this.log) {
            switch (event.t) {
            case 'event':
                printIndent();
                out.push(toStructuredString(event.data));
                break;
            case 'open':
                printIndent();
                out.push(toStructuredString(event.data) + ' {');
                indentLevel++;
                break;
            case 'close':
                indentLevel--;
                if (indentLevel < 0)
                    indentLevel = 0;
                printIndent();
                out.push('}');
                //out.push('} ' + toStructuredString(event.data));
                break;
            }

            out.push('\n');
        }

        return out.join('');
    }
}
