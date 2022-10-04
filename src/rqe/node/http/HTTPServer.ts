
import * as http from 'http'
import { Graph } from '../../Graph'
import { getGraph, newTable } from '../../globalGraph'

const http_routes = newTable({
    name: 'http_routes',
    attrs: {
        http_server: {},
        path: {},
        request_handler: {},
    },
    indexes: [{
        attrs: ['path']
    }]
});

export function createHttpServer(graph: Graph) {

    const server = http.createServer(async (request, response) => {
        try {
            console.log(request.method, request.url);

            const pathHandler = (await graph.query({
                attrs: { http_server: null, request_handler: null, path: request.url }
            })).one();

            if (pathHandler) {
                pathHandler.request_handler(request, response);
                return;
            }

            response.writeHead(404);
            response.end("not found");
        } catch (e) {
            response.writeHead(500);
            console.error(e);
            response.end("internal error while handling: " + request.url);
        }
    });

    const port = 8000;
    server.listen(port);
    console.log("Listening on: " + 8000);
    return { http_routes, server };
}

if (require.main === module) {
    createHttpServer(getGraph())
}
