
export function internalError(s: string) {
    console.error('[internal error] ' + s);
}

export default function logError(event) {
    const error = event.stack || event;

    console.error(error);
}
