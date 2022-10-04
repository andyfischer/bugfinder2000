

import { Task } from '../Step'
import { joinStreams } from '../utils/streamUtil'
import { runtimePlanAndExecute } from '../Plan3'

function run(step: Task) {
    const searchTuple = step.argsQuery();

    const receivers = joinStreams(2, step.output);
    const inputReceiver = receivers[0];

    step.input.sendTo(inputReceiver);

    const searchReceiver = receivers[1];

    runtimePlanAndExecute(step, searchTuple, null, searchReceiver);
}

export const add = {
    run
}
