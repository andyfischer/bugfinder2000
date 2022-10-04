
import { GraphContext } from './GraphContext'

export function getGraphFromContext(el: HTMLElement) {
    const graphContext: GraphContext = el.parentElement.closest('graph-context');

    if (!graphContext)
        throw new Error('<graph-context> not found');

    return graphContext.graph;
}
