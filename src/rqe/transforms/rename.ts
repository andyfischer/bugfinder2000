
import { Item, has, get } from '../Item'
import { TransformDef, VerbTransformStep } from '../Transform'

function rename(item: Item, step: VerbTransformStep): Item[] {
    const from = step.from;
    const to = step.to;

    if (has(item, from)) {
        const val = get(item, from);

        const updated = {
            ...item,
        }

        delete updated[from];
        updated[to] = val;

        return [updated];

    } else {
        return [item];
    }
}

const def: TransformDef = {
    func: rename
}

export default def;
