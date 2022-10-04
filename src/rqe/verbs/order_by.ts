
import { get } from '../Item'
import { Task } from '../Step'

function run(step: Task) {
    const { input, output } = step;
    const args = step.argsQuery();

    function getSortKey(item) {
        const items = [];

        for (const tag of args.tags)
            items.push(get(item, tag.attr));

        return items.join(' ');
    }

    input.aggregate(output, (items) => {
        // console.log('called order_by aggregate with', items);
        items.sort((a, b) => {
            return getSortKey(a).localeCompare(getSortKey(b));
        });

        return items;
    });
}

export const order_by = {
    run,
}
