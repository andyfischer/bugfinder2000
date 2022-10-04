
import { zeroPad } from '.'

export function timestampNow() {
    return (new Date()).toISOString();
}

export function shortLocalTime() {
    const now = new Date();
    return `${now.getHours()}:${zeroPad(now.getMinutes(), 2)}:${zeroPad(now.getSeconds(), 2)}`
}
