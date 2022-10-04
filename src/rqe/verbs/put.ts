
import { Task } from '../Step'
import { QueryTuple } from '../QueryTuple'
import { toTagged } from '../TaggedValue'
import { Stream } from '../Stream'
import { runtimePlanAndExecute } from '../Plan3'

function run(step: Task) {
    if (step.schemaOnly) {
        step.output.done();
        return;
    }

    const verbParams = step.argsQuery();

    if (verbParams.t !== 'queryTuple')
        throw new Error('internal error: step.argsQuery returned wrong data');

    step.input.streamingTransform(step.output, lhsItem => {

        // Kick off a put! query with this item.
        const putStep = new QueryTuple([{
            t: 'tag',
            attr: 'put!',
            value: new QueryTuple([]),
        }]);

        for (const [ attr, value ] of Object.entries(lhsItem)) {
            putStep.addTag({ t: 'tag', attr, value: toTagged(value) });
        }

        for (const tag of verbParams.tags) {
            putStep.addTag(tag);
        }

        const output = new Stream();
        runtimePlanAndExecute(step, putStep, null, output);
        return output;
    });
}

export const put = {
    run
}
