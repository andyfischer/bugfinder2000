
import { Task } from '../Step'
import { Item, has, get } from '../Item'

function run(step: Task) {
    const { tuple, input, output } = step;
    const args = step.args();

    input.transform(output, (item: Item) => {
        if (has(item, args.from)) {
            const val = get(item, args.from);

            const updated = {
                ...item,
            }

            delete updated[args.from];
            updated[args.to] = val;

            return [updated];

        } else {
            return [item];
        }
    });
}

export const rename = {
    run,
};

