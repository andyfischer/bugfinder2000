
import { ErrorItem } from '../Errors'
import { StreamEvent } from '../Stream'
import { QueryLike } from '../Query'
import { EventSource } from '../utils/Port'

export interface ConnectionProtocol {
    onStatusChange: EventSource<ProtocolStatusChange>
    onMessage: EventSource
    send(msg: Message): SendResult
    close(): void
}

export type SendResult = 'sent' | 'wait_for_ready'

export type ProtocolReadyState =

    // 'ready' state: The connection is open and can send messages.
    'ready'     

    // 'pending' state: The connection is not yet ready, but it's still trying.
    // Outgoing messages will be held in a queue stored by the connection.
    | 'pending' 

    // The protocol is closed. All attempts to send an outgoing message will fail.
    | 'closed'


/*
 * QueryMessage
 * 
 * Sent when delivering a query. This is sent by a "client" and received by a "server".
 */
export interface QueryMessage {
    t: 'queryMsg'
    query: QueryLike
    params: any
    output: number
    input?: number
    resourceTags?: string[]
}

/*
 * InputMessage
 *
 * Sent by a client when delivering an input message to a query's $input.
 */
export interface InputMessage {
    t: 'inputMsg'
    stream: number
    msg: StreamEvent
}

/*
 * OutputMessage
 *
 * Sent by a server when delivering result data for a query.
 */
export interface OutputMessage {
    t: 'outputMsg'
    stream: number
    msg: StreamEvent
}


export interface CloseStreamMessage {
    t: 'closeStreamMsg'
    stream: number
    error: ErrorItem
}

export type MessageToServer = InputMessage | QueryMessage | CloseStreamMessage
export type MessageToClient = OutputMessage | CloseStreamMessage
export type Message = MessageToServer | MessageToClient

export interface ProtocolReady {
    t: 'ready'
}

export interface ProtocolFailedToConnect {
    t: 'failed_to_connect'
}

export interface ProtocolClosed {
    t: 'closed'
}

export type ProtocolStatusChange = ProtocolReady | ProtocolFailedToConnect | ProtocolClosed
