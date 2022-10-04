

import { Task } from '../Step'
import { recordUnhandledException } from '../FailureTracking'

function run(step: Task) {
    if (step.schemaOnly)
        return;

    const listener_id = step.get('listener-id');
    for (const { close_callback } of step.graph.builtins.listener_close_signal().where({ listener_id })) {
        try {
            close_callback();
        } catch (e) {
            recordUnhandledException(e);
        }
    }
}

export const listen = {
    run
}
