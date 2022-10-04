
import { SendResult } from './ConnectionTypes'
import { LocalEventSource, Port } from '../utils/Port'
import { toPlainDataDeep } from '../TaggedValue'
import { Message, ConnectionProtocol, ProtocolStatusChange } from './ConnectionTypes'

interface Config {
    port: Port
}

export class MessagePort implements ConnectionProtocol {
    config: Config
    port: Port

    onStatusChange = new LocalEventSource<ProtocolStatusChange>()
    onMessage = new LocalEventSource()

    constructor(config: Config) {
        this.config = config;
        this.port = config.port;

        this.port.onMessage.addListener(msg => {
            this.onMessage.emit(msg);
        });
    }

    send(msg: Message): SendResult {
        msg = toPlainDataDeep(msg);
        this.port.postMessage(msg);
        return 'sent'
    }

    close() {
        this.port = null;
        this.onStatusChange.emit({t: 'closed'})
    }
}
