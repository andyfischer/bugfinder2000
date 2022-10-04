/*
 Connection

 Bidirectional connection between two agents.

 Each side of a connection can be in one of these modes:

  - Client mode (sends queries, receives results)
  - Server mode (handles queries using a Graph and sends the response)
  - Both client and server
 
 These client/server roles are separate from what the terms 'client' & 'server'
 mean at the protocol level. For example it's possible for an app to use HTTP
 fetch to start the connection (making them a 'client' at the protocol level), but then
 act as a server (responding to queries) at the Connection level.

 Responsibilities handled in this class:
  - Stores and manages the streams that are actively communicating across the connection
    (using StreamsBridge)
  - Uses a ConnectionProtocol - abstract interface for sending JS objects.
  - Listens to the protocol's onStatusChange, and keeps outgoing queries in a queue
    if the protocol is not ready.
  - Handles retry logic, if the protocol reports that it's not ready.

 */

import { recordUnhandledException } from '../FailureTracking'
import { IDSourceNumber as IDSource } from '../utils/IDSource'
import { StreamsBridge } from './StreamsBridge'
import { QueryLike, toQuery, QueryParameters } from '../Query'
import { Graph, Queryable } from '../Graph'
import { captureExceptionAsErrorItem } from '../Errors'
import { Stream, StreamReceiver } from '../Stream'
import { closeWithResourceTag } from '../Listeners'
import { assertDataIsSerializable } from '../Debug'
import { toPlainData } from '../TaggedValue'
import { EventSource } from '../utils/Port'
import { ConnectionProtocol, SendResult, ProtocolReadyState,
    InputMessage, QueryMessage, OutputMessage, CloseStreamMessage,
    Message, MessageToServer, MessageToClient, ProtocolStatusChange } from './ConnectionTypes'
import { VerboseConnectionLog } from '../config'
import { BackpressureStop } from '../Stream'

export interface ConnectionConfig {
    protocol: ConnectionProtocol
    onReady?: (conn: Connection) => void
    debugLabel?: string
    server?: {
        graph: Graph
    }
    client?: {
    }
}

interface QueryContext {
    resourceTags?: string[]
}
    
interface OutgoingQuery {
    query: QueryLike
    params: QueryParameters
    outputStreamId: number
    inputStreamId: number | null
    inputStream: Stream | null
}

class ServerState {
    streams = new StreamsBridge()
    resourceTag: string
    graph: Graph

    constructor(graph: Graph) {
        this.graph = graph;
    }

    beforeConnectionClose(connection: Connection) {
        this.streams.beforeConnectionClose(connection);
    }

    afterConnectionClose(errorType: string) {
        this.streams.afterConnectionClose({errorType});
        closeWithResourceTag(this.graph, this.resourceTag);
    }

    onStreamInput(connection: Connection, msg: InputMessage) {
        try {
            this.streams.receiveMessage(msg.stream, msg.msg);
        } catch (e) {
            const error = captureExceptionAsErrorItem(e);
            const closeMsg: CloseStreamMessage = {
                t: 'closeStreamMsg',
                stream: msg.stream,
                error,
            };

            connection.send(closeMsg);
        }
    }

    onQuery(connection: Connection, msg: QueryMessage) {
        let query = msg.query;
        const params = msg.params || {};

        // Add namespace isolation to any tags mentioned by the client.
        const queryResourceTags = (msg.resourceTags || [])
            .map(tag => this.resourceTag + '-query-' + tag);

        query = toQuery(query);

        if (msg.input) {
            params['$input'] = this.streams.startStream(msg.input);
        }

        const stream = this.graph.query(query, params, {
            resourceTags: [this.resourceTag].concat(queryResourceTags),
        });

        stream.sendTo(
            connection.streamToClient(msg.output)
        );
    }
}

class ClientState {
    streams = new StreamsBridge()
    nextStreamId = new IDSource();

    beforeConnectionClose(connection: Connection) {
        this.streams.beforeConnectionClose(connection);
    }

    afterConnectionClose(errorType: string) {
        this.streams.afterConnectionClose({errorType});
    }

    disconnect(errorType: string) {
        this.streams.afterConnectionClose({errorType});
    }

    onOutput(connection: Connection, msg: OutputMessage) {
        try {
            this.streams.receiveMessage(msg.stream, msg.msg);
        } catch (e) {
            const error = captureExceptionAsErrorItem(e);
            const closeMsg: CloseStreamMessage = {
                t: 'closeStreamMsg',
                stream: msg.stream,
                error,
            };

            connection.send(closeMsg);
        }
    }
}

export class Connection implements Queryable {
    config: ConnectionConfig
    protocol: ConnectionProtocol

    // Protocol state
    protocolReadyState: ProtocolReadyState = 'pending'
    outgoingQueue: OutgoingQuery[] = []

    // Server
    serverState: ServerState

    // Client
    clientState: ClientState

    constructor(config: ConnectionConfig) {
        this.config = config;
        this.protocol = this.config.protocol;

        this.protocol.onStatusChange.addListener((status) => this.onProtocolStatusChange(status));
        this.protocol.onMessage.addListener((msg) => this.onMessage(msg));

        this.clientState = new ClientState()

        if (config.server) {
            this.serverState = new ServerState(config.server.graph)
            this.serverState.resourceTag = 'socket-' + config.server.graph.nextResourceTag.take();
        }
    }

    /*
      Manually close the connection. Also called a 'graceful close'.
     */
    close(errorType: string = 'connection_disconnect') {

        if (VerboseConnectionLog)
            this.debugLog('called close()');

        // Graceful close initiated by our side.

        // First close all active streams

        if (this.clientState)
            this.clientState.beforeConnectionClose(this);

        if (this.serverState)
            this.serverState.beforeConnectionClose(this);

        this.protocol.close();
    }

    /*
      Callback triggered after we have detected that the protocol is closed.
     */
    afterConnectionClose(errorType: string = 'connection_disconnect') {
        if (this.clientState)
            this.clientState.afterConnectionClose(errorType);

        if (this.serverState)
            this.serverState.afterConnectionClose(errorType);
    }

    setProtocolReadyState(state: ProtocolReadyState) {
        if (this.protocolReadyState === state)
            return;

        let oldState = this.protocolReadyState;
        this.protocolReadyState = state;

        if (VerboseConnectionLog)
            this.debugLog(`ready state changed (${oldState} -> ${state})`);
    }

    onProtocolStatusChange(status: ProtocolStatusChange) {
        switch (status.t) {
        case 'ready': {
            this.setProtocolReadyState('ready');
            const queue = this.outgoingQueue;
            this.outgoingQueue = [];
            
            for (const outgoing of queue) 
                this.sendQuery(outgoing);

            if (this.config.onReady)
                this.config.onReady(this);
            break;
        }
        case 'closed':
            this.setProtocolReadyState('closed');
            this.afterConnectionClose();
            break;
        case 'failed_to_connect':
            this.setProtocolReadyState('closed');
            this.afterConnectionClose('failed_to_connect');
            break;
        }
    }

    onMessage(msg) {

        if (VerboseConnectionLog)
            this.debugLog(`received: ` + JSON.stringify(msg));

        switch (msg.t) {
        case 'inputMsg':
            if (!this.serverState)
                throw new Error("on inputMsg - Connection wasn't configured as a server");

            this.serverState.onStreamInput(this, msg);
        
            break;

        case 'queryMsg': {
            if (!this.serverState)
                throw new Error("on queryMsg - Connection wasn't configured as a server");

            this.serverState.onQuery(this, msg);
            break;
        }

        case 'closeStreamMsg':
            if (this.serverState)
                this.serverState.streams.closeStream(msg.stream, msg.error);

            if (this.clientState)
                this.clientState.streams.closeStream(msg.stream, msg.error);
            break;

        case 'outputMsg': {
            if (!this.clientState)
                throw new Error("on outputMsg - Connection wasn't configured as a client");

            this.clientState.onOutput(this, msg);
            break;
        }

        default:
            console.warn('unhandled message type in Connection');
        }
    }

    streamToClient(outputStream: number): StreamReceiver {
        return {
            receive: (msg) => {
                assertDataIsSerializable(msg);

                const outputMsg: MessageToClient = {
                    t: 'outputMsg',
                    stream: outputStream,
                    msg,
                }

                this.send(outputMsg);
            }
        }
    }

    streamToServer(inputStream: number): StreamReceiver {
        return {
            receive: (msg) => {
                if (this.protocolReadyState === 'closed') {
                    throw new BackpressureStop();
                }

                assertDataIsSerializable(msg);

                const connectionMsg: MessageToServer = {
                    t: 'inputMsg',
                    stream: inputStream,
                    msg,
                }

                this.send(connectionMsg);
            }
        }
    }

    send(msg: Message) {

        if (VerboseConnectionLog)
            this.debugLog(`sending: ` + JSON.stringify(msg));

        try {
            return this.protocol.send(msg);
        } catch (e) {
            recordUnhandledException(e);
        }
    }

    sendQuery(outgoing: OutgoingQuery) {
        const queryMsg: QueryMessage = {
            t: 'queryMsg',
            query: toPlainData(outgoing.query) as QueryLike,
            params: outgoing.params,
            output: outgoing.outputStreamId,
            input: outgoing.inputStreamId,
        }

        const result: SendResult = this.send(queryMsg);

        // Only send the input stream after the query has successfully been sent.
        if (result === 'sent' && outgoing.inputStreamId) {
            outgoing.inputStream.sendTo(
                this.streamToServer(outgoing.inputStreamId)
            );
        }

        return result;
    }

    query(query: QueryLike, params: any = null, context: QueryContext = {}): Stream {
        if (!this.clientState)
            throw new Error("can't query() - connection is not configured as client");

        if (this.protocolReadyState === 'closed') {
            const output = new Stream();
            output.forceClose({ errorType: 'connection_failed' });
            return output;
        }

        if (VerboseConnectionLog)
            this.debugLog(`requested query: ` + JSON.stringify(query));

        let inputStream = null;
        let inputStreamId = null;

        if (params && params['$input']) {

            inputStream = params['$input'];

            if (!inputStream.isStream())
                throw new Error('$input is not a valid Stream');

            if (!inputStream.isDoneAndEmpty()) {
                inputStreamId = this.clientState.nextStreamId.take();
            }

            params = {
                ...params,
            };
            delete params['$input'];
        }
        
        const outputStreamId = this.clientState.nextStreamId.take();
        const output = this.clientState.streams.startStream(outputStreamId);

        const outgoing: OutgoingQuery = { query, params, outputStreamId, inputStreamId, inputStream };

        const sendResponse = this.sendQuery(outgoing);

        if (sendResponse === 'wait_for_ready')
            this.outgoingQueue.push(outgoing);

        return output;
    }

    debugLog(msg: string) {
        let fullMsg = 'Connection ';
        if (this.config.debugLabel)
            fullMsg += `[${this.config.debugLabel}] `;
        fullMsg += msg;
        console.log(fullMsg);
    }
}
