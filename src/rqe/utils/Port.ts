
import { assertDataIsSerializable } from '../Debug'

export class LocalEventSource<T = any> implements EventSource<T> {
    listeners = [];

    addListener(callback) {
        this.listeners.push(callback);
    }

    removeListener(callback) {
        this.listeners = this.listeners.filter(c => c !== callback);
    }

    emit(msg: T = null) {
        for (const listener of this.listeners) {
            try {
                listener(msg);
            } catch (e) {
                console.error(e);
            }
        }
    }
}

export interface EventSource<MessageType = any> {
    addListener(callback: (msg: MessageType) => void): void
    removeListener(callback): void
}

export interface Port<IncomingMessage = any, OutgoingMessage = any> {
    postMessage(msg: OutgoingMessage): any
    disconnect(): void
    onMessage: EventSource<IncomingMessage>
    onDisconnect: EventSource<any>
}

export function portErrorWrap(port: Port, onPortError: (e) => void): Port {
    return {
        postMessage(msg) {
            try {
                port.postMessage(msg);
            } catch (e) {
                onPortError(e);
            }
        },
        disconnect() {
            port.disconnect();
        },
        onMessage: port.onMessage,
        onDisconnect: port.onDisconnect,
    }
}

class LocalPort<IncomingMessage = any, OutgoingMessage = any> implements Port<IncomingMessage,OutgoingMessage> {
    getPair: () => LocalPort

    onMessage = new LocalEventSource()
    onDisconnect = new LocalEventSource()
    disconnected = false

    constructor(getPair: () => LocalPort) {
        this.getPair = getPair;
    }

    postMessage(msg: OutgoingMessage) {
        assertDataIsSerializable(msg);

        // mimic the JSON serialization process that Chrome does
        msg = JSON.parse(JSON.stringify(msg));

        if (this.disconnected)
            throw new Error('disconnected');

        this.getPair().onMessage.emit(msg);
    }

    disconnect() {
        this.getPair().onDisconnect.emit();
        this.disconnected = true;
        delete this.onMessage;
        delete this.onDisconnect;
    }
}

export function createLocalPortPair() {

    let clientToServer;
    let serverToClient;

    clientToServer = new LocalPort(() => serverToClient);
    serverToClient = new LocalPort(() => clientToServer);

    return [ clientToServer, serverToClient ]
}

