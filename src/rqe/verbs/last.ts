
import { Task } from '../Step'

function run(step: Task) {
    let firstRecordedIndex = null;
    let lastRecordedIndex = null;
    let items = new Map<number, any>();
    const limit = parseInt(step.get('count'));

    if (limit === 0) {
        step.output.done();
        return;
    }

    step.input.sendTo({
        receive(data) {
            switch (data.t) {

            case 'done':
                for (const item of items.values())
                    step.output.receive(item);

                step.output.done();
                break;

            case 'item':
                if (firstRecordedIndex === null) {
                    firstRecordedIndex = 0;
                    lastRecordedIndex = 0;
                    items.set(lastRecordedIndex, data);
                } else {
                    lastRecordedIndex++;
                    items.set(lastRecordedIndex, data);

                    while ((lastRecordedIndex - firstRecordedIndex + 1) > limit) {
                        items.delete(firstRecordedIndex);
                        firstRecordedIndex++;
                    }
                }
                break;

            default:
                step.output.receive(data);
            }
        }
    })
}

export const last = {
    run,
}
