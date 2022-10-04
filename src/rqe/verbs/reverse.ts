
import { Task } from '../Step'

function run(step: Task) {
    const { input, output } = step;

    input.aggregate(output, items => {
        return items.reverse();
    });
}

export const reverse = {
    run,
};
