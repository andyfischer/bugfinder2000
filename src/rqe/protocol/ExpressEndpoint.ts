
import { Queryable } from '../Graph'
import { ErrorType, ErrorItem } from '../Errors'
import { QueryLike } from '../Query'
import { StreamEvent } from '../Stream'
import { c_done, c_error } from '../Enums'

interface Options {
    graph: Queryable
    beforeQuery?: (query: QueryLike, params?: any) => void
    onUnhandledException?: (err: Error) => void
    onInternalError?: (err: ErrorItem) => void
}

function errorTypeToStatusCode(errorType: ErrorType) {
    switch (errorType) {
    case 'unhandled_error':
        return 500;
    case 'provider_not_found':
    case 'no_table_found':
        return 404;
    case 'verb_not_found':
        return 400;
    }

    return 500;
}

export function rqeQueryExpressEndpoint(opts: Options) {

    function reply(res, status, data) {
        res.status(status);
        res.contentType('application/json');
        res.end(JSON.stringify(data));
    }

    return (req, res) => {

        try {
            const body = req.body;

            if (!body.query) {
                return reply(res, 400, {
                    errorMessage: 'missing .query'
                });
            }

            if (opts.beforeQuery) {
                opts.beforeQuery(body.query, body.params);
            }

            const events: StreamEvent[] = [];

            opts.graph.query(body.query, body.params)
            .sendTo({
                receive(msg) {
                    switch (msg.t) {
                    case c_done: {
                        let statusCode = 200;
                        let sawError = false;
                        let firstError = null;

                        for (const event of events) {
                            if (event.t === c_error && !firstError) {
                                firstError = event.item;
                                statusCode = errorTypeToStatusCode(firstError);
                            }
                        }

                        if (statusCode >= 500) {
                            if (opts.onInternalError) {
                                try {
                                    opts.onInternalError(firstError);
                                } catch (e) { }
                            }
                        }

                        return reply(res, statusCode, {
                            events
                        });

                        break;
                    }
                    default:
                        events.push(msg);
                    }
                }
            });

        } catch (err) {
            if (opts.onUnhandledException) {
                try {
                    opts.onUnhandledException(err);
                } catch (e) { }
            }
            return reply(res, 500, {
                unhandledException: true,
                errorMessage: err.message,
                ...err
            });
        }
    }
}

