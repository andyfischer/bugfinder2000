
import { Stream, StreamEvent } from '../Stream'
import { StreamProtocolValidator } from '../Debug'
import { ErrorItem } from '../Errors'
import { recordUnhandledException } from '../FailureTracking'
import { Connection } from './Connection'

/*
 StreamsBridge

 A StreamsBridge stores a set of open streams, each with a unique ID. The use case
 is when "bridging" a stream across a serialization protocol like a socket.

 Each side of the connection has their own StreamsBridge object to keep track of the live
 Stream objects on their side.

 On the server: the StreamsBridge will contain $input streams (inputs being sent to a query).

 On the client: the StreamsBridge will contain output streams (results from a query).
*/

export class StreamsBridge {
    streams = new Map<number, Stream>();
    validators = new Map<number, StreamProtocolValidator>();
    
    startStream(id: number) {
        if (this.streams.has(id))
            throw new Error("StreamsBridge protocol error: already have stream with id: " + id);

        let stream = new Stream(null, 'Socket.StreamsBridge for connection=' + id);

        this.streams.set(id, stream);
        this.validators.set(id, new StreamProtocolValidator(`stream validator for socket id=${id}`));
        return stream;
    }

    receiveMessage(id: number, msg: StreamEvent) {
        const stream = this.streams.get(id);

        if (!stream)
            throw new Error("StreamsBridge protocol error: no stream with id: " + id);

        this.validators.get(id).check(msg);

        if (msg.t === 'done') {
            this.streams.delete(id);
            this.validators.delete(id);
        }

        // May throw an exception if the stream has errored:
        stream.receive(msg);
    }

    beforeConnectionClose(connection: Connection) {
        for (const [ id, stream ] of this.streams.entries()) {
            connection.send({ t: 'closeStreamMsg', stream: id, error: null });
        }
    }

    closeStream(id: number, error: ErrorItem) {
        const stream = this.streams.get(id);

        if (!stream)
            return;

        this.streams.delete(id);
        this.validators.delete(id);

        stream.forceClose(error);
    }

    afterConnectionClose(error: ErrorItem) {
        for (const stream of this.streams.values()) {
            try {
                stream.forceClose(error);
            } catch (e) {
                recordUnhandledException(e);
            }
        }

        this.streams.clear();
        this.validators.clear();
    }
}

