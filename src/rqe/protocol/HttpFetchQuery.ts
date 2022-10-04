

import { QueryLike } from '../Query'
import { Stream, StreamEvent } from '../Stream'

type MaybeFunction<T> = T | (() => T)

interface ClientConfig {
    endpoint: string
    beforeSend?: (options: any) => any
    headers?: { [key: string]: string }
    fetch: any
}

interface QueryOptions {
    one?: boolean
}

export interface Request {
    query: QueryLike
    params?: QueryLike
    one?: boolean
}

export interface Response {
    error?: string
    events: StreamEvent[]
}

export class FetchClient {
    config: ClientConfig

    constructor(config: ClientConfig) {
        this.config = config;
    }

    query(query: QueryLike, params: any, opts: QueryOptions = {}): Stream {

        const stream = new Stream();

        let options = {
            body: JSON.stringify({
                query,
                params,
                one: opts.one,
            } as Request),
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...( this.config.headers || {} ),
            }
        };

        if (this.config.beforeSend)
            options = this.config.beforeSend(options) || options;

        (async () => {
            const fetchResponse = await this.config.fetch(this.config.endpoint, options);
            const text = await fetchResponse.text();

            let responseData: Response = null;
            
            try {
                responseData = JSON.parse(text);
            } catch (err) {
                console.error(err);
                console.error({text});
                stream.putError({
                    errorType: 'http_protocol_error',
                    message: `bad response data (couldn't parse as JSON)`,
                    data: [{
                        text,
                    }],
                });
                stream.done();
                return;
            }

            if (responseData.error) {
                stream.putError({
                    errorType: 'http_protocol_error',
                    message: responseData.error,
                    data: [{
                        responseData,
                    }]
                });
                stream.done();
                return;
            }

            if (responseData.events === undefined) {
                stream.putError({
                    errorType: 'http_protocol_error',
                    message: `bad response data (didn't have .events)`,
                    data: [{
                        responseData,
                    }]
                });
                stream.done();
                return;
            }

            for (const event of responseData.events) {
                stream.receive(event);
            }

            stream.done();
        })();

        return stream;
    }
}
