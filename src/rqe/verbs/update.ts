
import { Task } from '../Step'
import { QueryTuple } from '../QueryTuple'
import { Stream } from '../Stream'
import { toTagged } from '../TaggedValue'
import { runtimePlanAndExecute } from '../Plan3'

function run(step: Task) {
    const verbParams = step.tuple.shallowCopy();
    verbParams.deleteAttr('update');

    step.input.streamingTransform(step.output, lhsItem => {

        const updateDetails = new QueryTuple([]);

        // Kick off an update! query with this item.
        const updateStep = new QueryTuple([{
            t: 'tag',
            attr: 'update!',
            value: updateDetails,
        }]);

        for (const [ attr, value ] of Object.entries(lhsItem)) {
            updateStep.addTag({ t: 'tag', attr, value: toTagged(value) });
        }

        for (const tag of verbParams.tags) {
            updateDetails.addTag({ t: 'tag', attr: tag.attr, value: tag.value });
        }

        const output = new Stream();
        runtimePlanAndExecute(step, updateStep, null, output);
        return output;
    });
}

export const update = {
    run
}
