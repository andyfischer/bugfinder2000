
import { Task } from '../Step'
import { Handler } from '../Handler'
import { toQuery } from '../Query'
import { get } from '../Item'

interface Options {
    fetchAttr: string
    fetchWithQuery: string
}

export function withImpliedParam(basedOn: Handler, options: Options): Handler {
    const { fetchAttr, fetchWithQuery } = options;

    if (typeof fetchAttr !== 'string')
        throw new Error("fetchAttr must be string");
    if (typeof fetchWithQuery !== 'string')
        throw new Error("fetchWithQuery must be string");

    const fetchContext = toQuery(fetchWithQuery);
    const backingQuery = basedOn.toQuery();

    const modified = basedOn
            .without(fetchAttr)
            .withCallback(async (task: Task) => {

        const foundMissingAttr = await task.query(fetchContext, task.parameters);

        if (!foundMissingAttr)
            throw new Error("query returned no data: " + fetchContext.toQueryString())

        const parameters = {
            ...task.parameters,
            ...{ [ fetchAttr ]: get(foundMissingAttr.one(), fetchAttr)},
        };

        return task.query(backingQuery, parameters);
    });

    return modified;
}
