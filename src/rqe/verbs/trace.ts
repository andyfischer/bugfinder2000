
import { Task } from '../Step'
import { c_item } from '../Enums'

function run(step: Task) {


    step.input.sendTo({
        receive(msg) {
            switch (msg.t) {
            case c_item:
                step.output.receive(msg);

                if (!step.schemaOnly) {

                    const fixedAttrs = step.tuple.shallowCopy();
                    if (fixedAttrs.has('item'))
                        fixedAttrs.overwriteTag({ t: 'tag', attr: 'item', value: { t: 'item', item: msg.item }});

                    step.graph.query(fixedAttrs);

                    // TODO: should wait on query to finish.
                }

                break;
            default:
                step.output.receive(msg);
            }
        }
    });
}

export const trace = {
    run,
}
