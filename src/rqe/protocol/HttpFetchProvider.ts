
import { Stream } from '../Stream'
import { UseConfig } from './ProtocolCommon'
import { LooseMountPointSpec, resolveLooseMountPointSpec } from '../MountPoint'
import { Graph } from '../Graph'
import { Query } from '../Query'

interface RequestOptions {
    method: string
    headers: any
    body: any
}

interface Config {
    graph: Graph
    use?: UseConfig
    url: string
    fetch: any
    fixOutgoingRequest?: (opts: RequestOptions) => RequestOptions
}

export function connectHttpFetchClient(config: Config) {

    if (config.use.discoverApi)
        throw new Error("HTTP fetch client doesn't currently support discoverApi");

    function sendRequest(query: Query, input: Stream): Stream {

        const output = new Stream();

        const options: RequestOptions = {
            method: "POST",
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(query.toPlainData()),
        };

        (async () => {
            const response = await config.fetch(config.url, options);

            const text = await response.text();

            if (response.status !== 200) {
                let responseData = text;
                try {
                    responseData = JSON.parse(responseData);
                } catch (err) {}

                output.putError(responseData);
                output.done();
                return;
            }

            const items = text === '' ? [] : JSON.parse(text);
            for (const item of items)
                output.put(item);
            output.done();
        })();

        return output;
    }

    const provider = config.graph.addProvider(sendRequest);

    const module = config.graph.mount(config.use.expectedApi.map((point: LooseMountPointSpec) => {

        point = resolveLooseMountPointSpec(point);

        return {
            ...point,
            providerId: provider.provider_id,
        }
    }));
}
