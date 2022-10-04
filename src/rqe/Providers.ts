
import { Graph } from './Graph'
import { Query } from './Query'
import { Stream } from './Stream'
import { MultiStepPlan } from './MultiStepPlan'

export interface Provider {
    provider_id?: string
    runQuery(query: Query, input: Stream): Stream
}

export function newProviderTable(graph: Graph) {
    return graph.newTable<Provider>({
        attrs: {
            provider_id: { generate: { method: 'increment', prefix: 'provider-' }},
            runQuery: { },
        },
    })
}

export function rewritePlanForProviders(plan: MultiStepPlan) {
    // TODO
}

export function runQueryWithProvider(graph: Graph, providerId: string, query: Query, input: Stream): Stream {

    if (!graph.providerTable) {
        const out = graph.newStream('runQueryWithProvider error 1');
        out.putError({ errorType: 'provider_not_found', message: "Provider not found: " + providerId });
        out.done();
        return out;
    }

    const provider = graph.providers().one({ provider_id: providerId });

    if (!provider) {
        const out = graph.newStream('runQueryWithProvider error 2');
        out.putError({ errorType: 'provider_not_found', message: "Provider not found: " + providerId });
        out.done();
        return out;
    }

    return provider.runQuery(query, input);
}

/*
function optimizeForProviders(plannedQuery: QueryPlan) {
    // - Iterate across the PlannedSteps
    // - Check to see if any steps use mounts that have a providerId. We figure this out by
    //   looking at the block AST.
    // - If so, those steps are converted (and grouped, if multiple) into a run_query_with_provider step.

    const fixedSteps: PlannedStep[] = [];
    let wipProviderId: string = null;
    let wipProviderRemoteQuery: Query = null;
    let wipProviderQuery: QueryTuple = null;

    function finishInProgressProviderQuery() {
        if (!wipProviderQuery)
            return;

        if (wipProviderRemoteQuery.steps.length === 0) {
            wipProviderId = null;
            wipProviderQuery = null;
            wipProviderRemoteQuery = null;
            return;
        }

        // Save the wipProviderQuery that was in progress.
        wipProviderQuery.addTag({
            t: 'tag',
            attr: 'query',
            value: wipProviderRemoteQuery,
        });

        const insertStep = createOnePlannedStep(plannedQuery, wipProviderQuery, { t: 'no_value' });
        // console.log('created step for provider: ', JSON.stringify(wipProviderQuery, null, 2));
        fixedSteps.push(insertStep);
        wipProviderId = null;
        wipProviderQuery = null;
        wipProviderRemoteQuery = null;
    }

    for (const step of plannedQuery.steps) {
        const providerId = findProviderUsedByStep(plannedQuery, step);

        if (providerId && providerId !== wipProviderId) {
            finishInProgressProviderQuery();

            wipProviderId = providerId;

            wipProviderRemoteQuery = new Query([]);

            wipProviderQuery = new QueryTuple([{
                t: 'tag',
                attr: 'run_query_with_provider',
                value: { t: 'no_value' }
            },{
                t: 'tag',
                attr: 'provider_id',
                value: {
                    t: 'str_value',
                    str: providerId
                },
            }]);
        }

        if (wipProviderQuery) {
            wipProviderRemoteQuery.steps.push(step.tuple);
        } else {
            fixedSteps.push(step);
        }
    }

    finishInProgressProviderQuery();
    plannedQuery.steps = fixedSteps;
}
function findProviderUsedByStep(plannedQuery: QueryPlan, step: PlannedStep) {
    const providers = new Map();

    for (const usedMountRef of (step.expectedResult.usesMounts || [])) {
        const point = plannedQuery.graph.getMountPoint(usedMountRef);
        providers.set(point.providerId, true);
    }

    if (providers.size > 1)
        recordFailure('found_multiple_providers', { tuple: step.tuple, graph: plannedQuery.graph });

    const providersList = Array.from(providers.keys());
    return providersList[0];
}

*/
