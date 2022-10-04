
import { Task } from '../Step'
import { Item, has, get } from '../Item'

function run(step: Task) {

    const { input, output, tuple } = step;
    const args = step.args();

    // console.log('args', args);

    input.transform(output, (item: Item) => {
        for (const [key, value] of Object.entries(args)) {
            // console.log('where filter -', {key, value, item, args})
            if (!has(item, key))
                return [];

            const itemValue = get(item, key);

            // console.log('where filter itemValue', itemValue);

            if (itemValue == null)
                return [];

            if (value != null && value != itemValue)
                return [];
        }

        // console.log('item has passed: ', item);

        return [item];
    });
}

export const where = {
    run,
}
