
import { ConnectionProtocol } from './ConnectionTypes'
import { LocalEventSource } from '../utils/Port'
import { toPlainDataDeep } from '../TaggedValue'
import { Message, ProtocolStatusChange } from './ConnectionTypes'
import { VerboseSocketLog } from '../config'

interface WebSocket {
    addEventListener(name: string, callback: any): void
    removeEventListener(name: string, callback: any): void
    send(msg: string): void
    close(): void
    readyState: number
}

interface Config {
    openSocket(): WebSocket
    maxConnectAttempts?: number
}
 
function getRetryDelay(attempts) {
    switch (attempts) {
    case 1:
        return 100;
    case 2:
        return 200;
    case 3:
        return 500;
    case 4:
        return 1000;
    case 5:
    default:
        return 2000;
    }
}

const DefaultMaxConnectAttepts = 5;

const READY_STATE_CONNECTING = 0;
const READY_STATE_OPEN = 1;
const READY_STATE_CLOSING = 2;
const READY_STATE_CLOSED = 3;

export class WebSocketClient implements ConnectionProtocol {

    config: Config

    ws: WebSocket

    onStatusChange = new LocalEventSource<ProtocolStatusChange>()
    onMessage = new LocalEventSource()

    connectFailedRetryCount = 0
    reconnectTimer: any
    maxConnectAttempts: number

    constructor(config: Config) {
        this.config = config;

        this.maxConnectAttempts = (config.maxConnectAttempts === undefined) ? DefaultMaxConnectAttepts
            : config.maxConnectAttempts;
    }

    openSocket() {
        if (this.ws) {
            console.error("WebSocketClient logic error - already have .ws in openSocket");
        }

        let ws;
        try {
            ws = this.config.openSocket();
        } catch (err) {
            console.error(err);
            console.error('uncaught error in config.openSocket');
            this.onConnectFailed();
            return;
        }

        let closed = false;

        const onMessage = (evt) => {
            if (closed)
                return;

            const parsed = JSON.parse(evt.data);

            if (VerboseSocketLog) {
                console.log('WS client receive:', parsed);
            }

            this.onMessage.emit(parsed);
        }

        const onOpen = () => {
            if (closed)
                return;

            this.connectFailedRetryCount = 0;
            this.onStatusChange.emit({t: 'ready'});
        }

        const onError = (err) => {

            if (closed)
                return;

            //this.setReadyState('not_ready');

            removeListeners();
            closed = true;
            this.ws = null;

            try {
                this.onConnectFailed();
            } catch (e) {
                console.error('unhandled exception in WebSocketClient.onError');
            }
        }

        const onClose = () => {
            if (closed)
                return;

            this.onStatusChange.emit({t: 'closed'});

            removeListeners();
            closed = true;
            this.ws = null;
        }

        const removeListeners = () => {
            ws.removeEventListener('message', onMessage);
            ws.removeEventListener('open', onOpen);
            ws.removeEventListener('error', onError);
            ws.removeEventListener('close', onClose);
        }

        try {
            ws.addEventListener('message', onMessage);
            ws.addEventListener('open', onOpen);
            ws.addEventListener('error', onError);
            ws.addEventListener('close', onClose);
        } catch (err) {
            console.error('uncaught error - WebSocketClient addEventListener');
        }

        this.ws = ws;
    }

    send(msg: Message) {
        if (!this.ws) {
            this.openSocket();
            return 'wait_for_ready';
        }

        if (this.ws.readyState !== READY_STATE_OPEN) {
            return 'wait_for_ready'
        }

        msg = toPlainDataDeep(msg);

        if (VerboseSocketLog) {
            console.log('WS client send:', msg);
        }

        this.ws.send(JSON.stringify(msg));
        return 'sent'
    }

    close() {
        this.ws.close();
    }

    onConnectFailed() {
        this.connectFailedRetryCount++;

        if (this.connectFailedRetryCount > this.maxConnectAttempts) {
            this.onStatusChange.emit({t: 'failed_to_connect'});
        } else {
            if (!this.reconnectTimer) {
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = null;
                    try {
                        this.openSocket();
                    } catch (e) {
                        console.error('unhandled exception in WebSocketClient reconnectTimer openSocket', e);
                    }
                }, getRetryDelay(this.connectFailedRetryCount));
            }
        }
    }
}
