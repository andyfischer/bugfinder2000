
import { Queryable } from '../Graph'
import { getGraph } from '..'

export class GraphContext extends HTMLElement {
    graph: Queryable

    constructor() {
        super();
        this.graph = getGraph();
    }
}

customElements.define('graph-context', GraphContext);
