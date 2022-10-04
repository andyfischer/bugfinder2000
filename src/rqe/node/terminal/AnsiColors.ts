
import { Color } from '../../repl/Colors'

const resetForeground = 39;
const resetBackground = 49;

export function colorize(color: Color, str: string) {
    return `\u001b[38;2;${color.r};${color.g};${color.b};m${str}\u001b[${resetForeground}m`
}

function toColorizeFunction(color: Color) {
    return (str) => colorize(color, str);
}

export const black = toColorizeFunction({ r: 0, g: 0, b: 0});
export const red = toColorizeFunction({ r: 255, g: 0, b: 0});
export const green = toColorizeFunction({ r: 0, g: 255, b: 0});
export const yellow = toColorizeFunction({ r: 255, g: 255, b: 0});

/*
export const green = toColorizeFunction(32);
export const yellow = toColorizeFunction(33);
export const blue = toColorizeFunction(34);
export const magenta = toColorizeFunction(35);
export const cyan = toColorizeFunction(36);
export const white = toColorizeFunction(37);
export const gray = toColorizeFunction(90);
*/

// todo
//  convert from CIE color space

// console.log(red("this is red") + "this is normal");
