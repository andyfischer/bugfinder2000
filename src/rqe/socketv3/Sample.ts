
import { Connection } from './Connection'
import { WebSocketClient } from './WebSocketClient'

export function startSampleSocket() {
    const connection = new Connection({
        protocol: new WebSocketClient({
            openSocket() {
                return new WebSocket('ws://localhost:4000');
            }
        }),
        client: {},
    });
}
