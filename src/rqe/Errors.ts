
import { Table } from './Table/index'
import { TableSchema } from './Schema'
import { QueryTuple } from './QueryTuple'
import { QueryLike } from './Query'
import { Item } from './Item'
import { toStructuredString } from './Debug'

export type ErrorType = 'verb_not_found' | 'unhandled_exception' | 'provider_not_found' | 'missing_parameter'
    | 'no_table_found' | 'Unimplemented' | 'TableNotFound'
    | 'MissingAttrs' | 'MissingValue' | 'NotSupported' | 'ExtraAttrs'
    | 'http_protocol_error' | string

export interface ErrorItem {
    errorType?: ErrorType
    stack?: any
    message?: string
    data?: Item[]
    fromQuery?: QueryLike
    cause?: Error
}

export class TableSchemaIssue extends Error {
    constructor(table: Table, message: string) {
        super(`Table [${table.name}] schema issue: ${message}`);
    }
}

interface TableImplementationMetadata {
    filename?: string
}

export class TableImplementationError extends Error {
    constructor(message: string, meta?: TableImplementationMetadata) {
        super(`Module error: ${message}`);
    }
}

export const ErrorTableSchema: TableSchema  = {
    attrs: {
        errorType: {},
        message: {},
        stack: {},
        step: {},
        phase: {},
    }
}

export function errorItemToOneLineString(item: ErrorItem) {
    let out = `error (${item.errorType})`;

    if (item.message)
        out += `: ${item.message}`;

    if (item.fromQuery)
        out += `: ${toStructuredString(item.fromQuery)}`;

    return out;
}

export function errorItemToString(item: ErrorItem) {
    let out = `error (${item.errorType})`;

    if (item.message)
        out += `: ${item.message}`;

    for (const dataItem of item.data || []) {
        if (dataItem.query)
            out += `\n (${dataItem.query.toQueryString()})`;
        else
            out += `\n (${toStructuredString(dataItem)})`;
    }

    if (item.fromQuery)
            out += `\n from query: (${toStructuredString(item.fromQuery)})`;

    const otherDetails = { ...item };
    delete otherDetails.errorType;
    delete otherDetails.fromQuery;
    delete otherDetails.data;
    delete otherDetails.message;
    const otherDetailsString = JSON.stringify(otherDetails);
    if (otherDetailsString !== '{}')
        out += `\n ${otherDetailsString}`

    if (item.stack)
        out += `\nStack trace: ${item.stack}`

    return out;
}

export function newErrorTable() {
    return new Table<ErrorItem>(ErrorTableSchema);
}

export class ErrorExtended extends Error {
    errorItem: ErrorItem

    constructor(errorItem: ErrorItem) {
        super(errorItemToString(errorItem));
        this.errorItem = errorItem;
    }

    toString() {
        return errorItemToString(this.errorItem);
    }
}

export function newError(item: ErrorItem): ErrorExtended {
    return new ErrorExtended(item);
}

export function collectErrorItems(items: ErrorItem[]): ErrorItem {

    // TODO: some sort of priority system for picking the 'first' error?
    
    if (items.length === 0)
        throw new Error('internal error - collectErrorItems called with empty list');

    const first = items[0];
    if (items.length > 1) {
        first.data = first.data || [];
        first.data.push({ moreErrors: items.slice(1) });
    }

    return first;
}

export function newErrorFromItems(items: ErrorItem[]): ErrorExtended {

    const collected = collectErrorItems(items);

    return new ErrorExtended(collected);
}

interface ErrorContext {
    fromQuery?: QueryTuple
}

export function captureExceptionAsErrorItem(error: Error, context: ErrorContext = {}): ErrorItem {
    if ((error as ErrorExtended).errorItem) {
        const errorItem = (error as ErrorExtended).errorItem;

        return {
            errorType: errorItem.errorType || 'unhandled_exception',
            fromQuery: errorItem.fromQuery || context.fromQuery || null,
            message: errorItem.message,
            stack:  errorItem.stack || error.stack,
            // ...(error as ErrorExtended).errorItem,
        }
    }

    if (error instanceof Error) {
        return {
            errorType: (error as any).errorType || 'unhandled_exception',
            message: error.message,
            stack: error.stack,
            fromQuery: context.fromQuery || (error as any).fromQuery || null,
        };
    }

    return {
        errorType: (error as any).errorType || 'unknown_error',
        message: (error as any).message,
        stack: (error as any).stack,
        fromQuery: context.fromQuery || (error as any).fromQuery || null,
    };
}
