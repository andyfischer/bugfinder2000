
import HTTP from 'http'
import { Graph } from '../../Graph'

interface Options {
    graph: Graph
    ws: any
    port: number

    onQuery?: (conn, query) => void
    onConnection?: () => void
    onListen?: (port) => void
}

export function createSocketServer(options: Options) {
    const server = HTTP.createServer();

    throw new Error("fixme");
    /*
    const wsServer = new options.ws.Server({
        server: server
    });

    const rqeSocketServer = new RqeSocketServer({
        graph: options.graph,
        wsServer: wsServer,
        onQuery: (conn, query) => {
            if (options.onQuery)
                options.onQuery(conn, query);
        },
        onConnection: () => {
            if (options.onConnection)
                options.onConnection();
        },
    });
    */

    server.listen(options.port);

    if (options.onListen)
        options.onListen(options.port);

    return server;
}
