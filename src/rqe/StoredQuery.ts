
/**
  StoredQuery

  A "stored" query is just a query that's been saved to run later. It is not a planned query
  yet. It might not even be ready to execute at the time when it's created. StoredQuerys
  can be created during a module's setup phase.

**/


import { Query } from './Query'

export type DynamicValues = { [attr: string]: any }

export class StoredQuery {
    query: Query;

    constructor(query: Query) {
        this.query = query;
    }

    withValues(values: DynamicValues): Query {
        throw new Error('todo');
        /*
        const ref = { query: this.query }
        for (const [ tag, getWritableTag ] of rewriteQueryTags(ref)) {
            if (values[tag.attr]) {
                getWritableTag().value = { t: 'str_value', str: values[tag.attr] }
            }
        }
        return ref.query;
        */
    }
}
