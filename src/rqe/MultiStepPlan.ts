
import { Graph } from './Graph'
import { Query } from './Query'
import { Plan3, createPlan, executePlan } from './Plan3'
import { QueryExecutionContext } from './Graph'
import { ExpectedValue } from './Plan3'
import { Stream } from './Stream'
import { QueryParameters } from './Query'

export interface MultiStepPlan {
    graph: Graph
    steps: Plan3[]

    expectedOutput: ExpectedValue
}

export function createMultiStepPlan(graph: Graph, context: QueryExecutionContext, query: Query) {

    const plan: MultiStepPlan = {
        graph,
        steps: [],
        expectedOutput: null,
    };

    if (query.steps.length === 0) {
        plan.steps = [];
        return plan;
    }

    for (let i=0; i < query.steps.length; i++) {
        let expectedInput: ExpectedValue;
        const tuple = query.steps[i];

        if (i === 0) {
            expectedInput = query.isTransform ? { t: 'some_value' } : { t: 'no_value' };
        } else {
            expectedInput = plan.steps[i - 1].expectedOutput;
        }

        const singleStepPlan = createPlan(graph, context, tuple, expectedInput);

        plan.steps.push(singleStepPlan);
    }

    plan.expectedOutput = plan.steps[plan.steps.length-1].expectedOutput;

    return plan;
}

export function executeMultiStepPlan(plan: MultiStepPlan, parameters: QueryParameters, input: Stream, output: Stream) {

    let previousTask = null;

    if (plan.steps.length === 0) {
        output.done();
        return;
    }

    const inputStreams: Stream[] = []
    const outputStreams: Stream[] = []

    for (let i=0; i < plan.steps.length; i++) {
        if (i === 0) {
            inputStreams.push(input);
        } else {
            inputStreams.push(new Stream());
        }
    }

    for (let i=0; i < plan.steps.length; i++) {
        if (i < (plan.steps.length-1)) {
            outputStreams.push(inputStreams[i+1]);
        } else {
            outputStreams.push(output);
        }
    }

    for (let i=0; i < plan.steps.length; i++) {
        executePlan(plan.steps[i], parameters, inputStreams[i], outputStreams[i]);
    }
}

export function runtimePlanAndExecuteMultiStep(graph: Graph, context: QueryExecutionContext, query: Query, parameters: QueryParameters, input: Stream | null, output: Stream) {
    input = input || Stream.newEmptyStream();
    const plan = createMultiStepPlan(graph, context, query);
    executeMultiStepPlan(plan, parameters, input, output);
}
