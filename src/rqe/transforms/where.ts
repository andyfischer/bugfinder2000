
import { Item, has, get } from '../Item'
import { TransformDef, VerbTransformStep } from '../Transform'

function where(item: Item, step: VerbTransformStep): Item[] {

    for (const [ key, value ] of Object.entries(step.args)) {

        if (!has(item, key))
            return [];

        if (value != null && value != get(item, key))
            return [];
    }

    return [item];
}

const def: TransformDef = {
    func: where
}

export default def;
