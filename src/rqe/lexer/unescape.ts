
export default function unescape(s: string) {
    const out = [];

    let sliceStart = 0;

    for (let i = 0; i < s.length; i++) {
        if (s[i] === '\\') {
            out.push(s.slice(sliceStart, i));
            sliceStart = i + 1;
        }
    }

    out.push(s.slice(sliceStart));

    return out.join('');
}
