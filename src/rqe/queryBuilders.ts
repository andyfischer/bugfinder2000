
import { QueryLike, Query, toQuery } from './Query'
import { toQueryTuple, QueryStepLike } from './QueryTuple'

export function add(...queries: QueryLike[]): Query {

    let combinedSteps = [];

    if (queries.length === 0) {
        return new Query([]);
    }

    for (const queryLike of queries) {
        combinedSteps = combinedSteps.concat(toQuery(queryLike).steps);
    }

    return new Query(combinedSteps);
}

export function where(looseLhs: QueryLike, looseWhereCondition: QueryStepLike): Query {

    const lhs = toQuery(looseLhs);
    const where = toQueryTuple(looseWhereCondition);
    where.addTag({ t: 'tag', attr: 'where', value: { t: 'no_value' } });

    return new Query(lhs.steps.concat([where]));
}
