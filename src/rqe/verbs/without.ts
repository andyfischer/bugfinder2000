
import { Task } from '../Step'
import { Item, entries } from '../Item'

function run(step: Task) {
    const { input, output } = step;
    const args = step.argsQuery();

    input.transform(output, (item: Item) => {
        const out = {};

        for (const [key,value] of entries(item)) {
            if (!args.has(key))
                out[key] = value;
        }

        return [out];
    });
}

export const without = {
    run,
}
