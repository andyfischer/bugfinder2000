
import { UpdateModule, OutputData, MessageToSubprocess } from './SubprocessMount'
import { getGraph } from '../globalGraph'

const activeMountsById = new Map();
let _hasConnectedViaIPC = false;

export function maybeConnectFromSubprocess() {
    if (!process.env.RQE_SUBPROCESS)
        return;
    if (_hasConnectedViaIPC)
        return;

    if (!process.send)
        throw new Error("didn't find a Node IPC channel");

    const graph = getGraph();

    process.on('message', (msg: MessageToSubprocess) => {
        switch (msg.t) {
        case 'query':
            const { query, input, output } = msg;

            const outputStream = graph.query(query);

            outputStream.sendTo({
                receive(streamMsg) {
                    const outgoing: OutputData = {
                        t: 'output',
                        streamId: output,
                        msg: streamMsg,
                    };

                    process.send(outgoing);
                }
            });

            break;
        }
    });

    _hasConnectedViaIPC = true;

    graph.addSchemaListener(event => {
        switch (event.verb) {
        case 'update':
            const outgoing: UpdateModule = {
                t: 'updateModule',
                id: event.item.id,
                pointSpecs: event.item.points.map(point => point.spec),
            }

            process.send(outgoing as UpdateModule);
            break;
        }
    }, { backlog: true });

}
