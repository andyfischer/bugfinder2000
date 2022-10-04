
export function timedOut(p: Promise<any>, timeoutMs: number) {
    return new Promise(resolve => {
        const timer = setTimeout((() => {
            // timed out
            resolve(true);
        }), timeoutMs);

        p = p.finally(() => {
            clearTimeout(timer);
            resolve(false);
        });
    });
}
