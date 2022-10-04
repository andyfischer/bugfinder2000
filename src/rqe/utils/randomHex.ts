
const hexLetters = '0123456789abcdef';

export function randomHex(length: number) {
    let out = '';

    while (length > 0) {
        const letter = hexLetters[Math.floor(Math.random() * hexLetters.length)];
        out += letter;
        length--;
    }
    return out;
}

