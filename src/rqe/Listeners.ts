
import { Task } from './Step'
import { Graph } from './Graph'
import { Stream } from './Stream'
import { recordUnhandledException } from './FailureTracking'

export function trackNewListenStream(step: Task, stream: Stream) {

    const graph = step.graph;

    let listener_id = step.getOptional('listener-id', null);
    let listen_stream_id = graph.nextListenStreamId.take();
    let resourceTags = step.context?.resourceTags;

    if (!listener_id && !resourceTags)
        return;

    let hasClosed = false;
    function close_callback() {
        if (!hasClosed) {
            stream.close();
            hasClosed = true;

            if (listener_id) {
                graph.builtins.listener_close_signal().delete({
                    listen_stream_id
                })
            }
            if (resourceTags) {
                graph.builtins.resource_tag_to_close_signal().delete({
                    listen_stream_id
                })
            }
        }
    }

    if (listener_id) {
        graph.builtins.listener_close_signal().put({
            listener_id,
            listen_stream_id,
            close_callback,
        });
    }

    if (resourceTags) {
        for (const tag of resourceTags) {
            graph.builtins.resource_tag_to_close_signal().put({
                'resource_tag': tag,
                listen_stream_id,
                close_callback,
            });
        }
    }
}

export function closeWithResourceTag(graph: Graph, tag: string) {
    if (!graph.builtins.has('resource_tag_to_close_signal'))
        return;

    for (const { close_callback } of graph.builtins.resource_tag_to_close_signal()) {
        try {
            close_callback();
        } catch (e) {
            recordUnhandledException(e, graph);
        }
    }
}
