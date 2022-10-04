
import { Stream } from '../Stream'
import { Task } from '../Step'
import { c_done } from '../Enums'
import { joinStreams } from '../utils/streamUtil'
import { runtimePlanAndExecute } from '../Plan3'

function run(step: Task) {
    if (step.schemaOnly) {
        step.output.done();
        return;
    }

    const receivers = joinStreams(2, step.output);

    let hasLaunchedSearch = false;

    const remainingTuple = step.tuple.shallowCopy();
    remainingTuple.deleteAttr('then');

    const searchInput = Stream.newEmptyStream();
    const searchOutput = Stream.newStreamToReceiver(receivers[1]);

    step.input.sendTo({
        receive(msg) {
            receivers[0].receive(msg);

            if (msg.t === c_done && !hasLaunchedSearch) {
                hasLaunchedSearch = true;
                runtimePlanAndExecute(step, remainingTuple, searchInput, searchOutput);
            }
        }
    });
}

export const then = {
    run,
}
