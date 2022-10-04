
export function toCapitalCase(s: string) {
    let capitalizeNext = true;

    let out = '';

    for (let i = 0; i < s.length; i++) {
        let c = s[i];

        if (c === '_' || c === '-' || c === ' ') {
            capitalizeNext = true;
            continue;
        }

        if (capitalizeNext) {
            c = c.toUpperCase();
            capitalizeNext = false;
        }

        out += c;
    }

    return out;
}
