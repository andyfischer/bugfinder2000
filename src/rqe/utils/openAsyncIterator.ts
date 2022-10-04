
export function openAsyncIterator<T = any>() {

    let incoming: T[] = [];
    let isDone = false;
    let unpauseIterator: () => void = null;

    // 'Send' callback - Push to incoming and unpauses the loop.
    function send(msg: T) {
        if (isDone)
            throw new Error('usage error: called send() after done()');

        incoming.push(msg);

        if (unpauseIterator)
            unpauseIterator();
    }
    
    function done() {
        isDone = true;

        if (unpauseIterator)
            unpauseIterator();
    }
    
    // Iterator - Consumes and yields the list and pauses when done.
    const iterator = {
        [Symbol.asyncIterator]: async function* () {

            // Main loop - Reads from 'incoming'.
            while (true) {
                while (incoming.length > 0) {
                    const received: T[] = incoming;
                    incoming = [];

                    for (const msg of received) {
                        yield msg;
                    }
                }

                if (isDone)
                    return;

                // Wait until stream listener calls unpauseIterator()
                await new Promise<void>(r => { unpauseIterator = r });
                unpauseIterator = null;
            }
        }
    }

    return {
        send,
        done,
        iterator,
    }
}

