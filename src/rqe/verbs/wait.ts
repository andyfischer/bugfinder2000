
import { Task } from '../Step'

function run(step: Task) {
    const duration = parseInt(step.get('duration'), 10);

    setTimeout(() => {
        step.input.sendTo(step.output);
    }, duration);
}

export const wait = {
    run,
}
