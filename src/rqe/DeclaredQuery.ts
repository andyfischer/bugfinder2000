
import { Graph } from './Graph'
import { Query, QueryLike, toQuery } from './Query'

export class DeclaredQuery {
    graph: Graph
    query: Query

    constructor(graph: Graph, queryLike: QueryLike) {
        this.graph = graph;
        this.query = toQuery(queryLike);
    }

    run(parameters: any) {
        return this.graph.query(this.query, parameters);
    }
}
