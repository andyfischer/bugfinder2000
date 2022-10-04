
import { Item, get, set } from './Item'
import { unwrapTagged } from './TaggedValue'
import { Query } from './Query'
import { QueryTuple } from './QueryTuple'
import { isItem } from './Item'
import { Graph } from './Graph'
import { Stream } from './Stream'

export function updateItemUsingQuery(graph: Graph, item: Item, updateStep: QueryTuple) {
    /*
       Go through all the attrs in 'updateStep' and apply them as updates to the item.
       Some attrs might include nested queries for nested updates.
    */

    for (const tag of updateStep.tags) {

        if (tag.value.t === 'query') {
            
            const nestedQuery: Query = tag.value;

            // Modify this attr according to this nested query..

            if (!isItem(get(item, tag.attr)))
                throw new Error("expected nested object for: " + tag.attr);

            let $input;

            if (nestedQuery.isTransform) {
                $input = Stream.fromList([ get(item, tag.attr) ]);
            }

            // TODO: support async here
            const result = graph.query(nestedQuery, { $input }).sync();
            result.throwErrors();

            const updated = result.one();

            set(item, tag.attr, updated);

            continue;
        }

        item[tag.attr] = unwrapTagged(tag.value);
    }
}
