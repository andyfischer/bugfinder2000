
import { Task } from '../Step'

function run(step: Task) {
    const { output } = step;

    output.put(step.args());
    output.done();
}

export const value = {
    run,
}
