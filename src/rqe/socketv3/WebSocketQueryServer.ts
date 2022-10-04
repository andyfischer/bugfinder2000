
import { Connection, ConnectionConfig } from './Connection'
import { LocalEventSource } from '../utils/Port'
import { toPlainDataDeep } from '../TaggedValue'
import { Graph } from '../Graph'
import { Message } from './ConnectionTypes'
import { VerboseSocketLog } from '../config'
import { ConnectionProtocol, ProtocolStatusChange } from './ConnectionTypes'
import { IDSourceNumber as IDSource } from '../utils/IDSource'

interface ServerOptions {
    graph: Graph
    wsServer: any
    clientConfig?: {
        debugLabel?: string
    }

    onConnectionReady?: (connection: Connection) => void
}

export class WebSocketQueryServer {
    options: ServerOptions
    nextConnectionId = new IDSource()
    activeConnections = new Map<number, Connection>();

    constructor(options: ServerOptions) {
        this.options = options;
        options.wsServer.on('connection', ws => {
            this.setupConnection(ws);
        });
    }

    close() {
        for (const [id, connection] of this.activeConnections.entries()) {
            connection.close();
        }

        this.activeConnections.clear();
        this.options.wsServer.close();
    }

    setupConnection(ws) {
        const connectionId = this.nextConnectionId.take();
        const onMessage = new LocalEventSource();
        const onStatusChange = new LocalEventSource<ProtocolStatusChange>();

        ws.addEventListener('message', evt => {
            const parsed = JSON.parse(evt.data);

            if (VerboseSocketLog) {
                console.log('WS server receive:', parsed);
            }

            onMessage.emit(parsed);
        });

        ws.addEventListener('close', () => {
            onStatusChange.emit({t:'closed'});
            this.activeConnections.delete(connectionId);
        });

        const connection = new Connection({
            ...(this.options.clientConfig || {}),
            protocol: {
                onStatusChange,
                onMessage,
                send(msg: Message) {
                    // todo: check if ready state is closed
                    // if (this.ws.readyState !== READY_STATE_OPEN) {

                    msg = toPlainDataDeep(msg);

                    if (VerboseSocketLog) {
                        console.log('WS server send:', msg);
                    }

                    ws.send(JSON.stringify(msg));
                    return 'sent';
                },
                close() {
                    ws.close();
                }
            },
            server: {
                graph: this.options.graph
            }
        });

        onStatusChange.emit({t:'ready'});
        this.activeConnections.set(connectionId, connection);
    }
}
