
import { Verb } from './_shared'
import { QueryTuple } from '../QueryTuple'

import { add } from './add'
import { count } from './count'
import { count_by } from './count_by'
import { get } from './get'
import { join } from './join'
import { just } from './just'
import { incoming } from './incoming'
import { limit } from './limit'
import { listen } from './listen'
import { last } from './last'
import { need } from './need'
import { one } from './one'
import { order_by } from './order_by'
import { put } from './put'
import { rate } from './rate'
import { rename } from './rename'
import { reverse } from './reverse'
import { run_query_with_provider } from './run_query_with_provider'
// import { save_to_csv } from './save_to_csv'
import { then } from './then'
import { trace } from './trace'
import { to_csv } from './to_csv'
import { update } from './update'
import { wait } from './wait'
import { where } from './where'
import { _with } from './with'
import { without } from './without'
import { value } from './value'

let _everyVerb: { [name: string]: Verb };

function init() {
    _everyVerb = {
        add,
        count,
        count_by,
        get,
        join,
        just,
        incoming,
        limit,
        listen,
        last,
        need,
        one,
        order_by,
        put,
        rate,
        rename,
        reverse,
        run_query_with_provider,
//         save_to_csv,
        then,
        to_csv,
        trace,
        update,
        wait,
        where,
        with: _with,
        without,
        value,
    }
}

export function everyVerb(): { [name: string]: any } {
    if (!_everyVerb)
        init();

    return _everyVerb;
}

export function getVerb(verb: string) {
    if (!_everyVerb)
        init();

    return _everyVerb[verb];
}

export function listEveryVerb() {
    if (!_everyVerb)
        init();

    return Object.keys(_everyVerb);
}

export function findBuiltinVerb(tuple: QueryTuple) {
    for (const tag of tuple.tags)
        if (getVerb(tag.attr))
            return getVerb(tag.attr);
}
