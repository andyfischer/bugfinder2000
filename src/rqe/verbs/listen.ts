

import { Task } from '../Step'

function run(step: Task) {
    if (step.schemaOnly) {
        step.output.done();
        return;
    }

    const stream = step.queryRelated({ with: 'listener-stream' }).one().attr('listener-stream').sync();

    step.async();
    stream.sendTo(step.output);
}

export const listen = {
    run
}
