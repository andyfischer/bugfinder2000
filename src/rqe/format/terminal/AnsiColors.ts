
import { Color } from '../../repl/Colors'

const setForeground = 38;
const resetForeground = 39;
const setBackground = 48;
const resetBackground = 49;

function colorizeFunction(color: Color) {
    return (str) => colorize(color, str);
}

function colorizeBgFunction(color: Color) {
    return (str) => colorizeBg(color, str);
}

export function colorize(color: Color, str: string) {
    return `\u001b[${setForeground};2;${color.r};${color.g};${color.b};m${str}\u001b[${resetForeground}m`
}

export function colorizeBg(color: Color, str: string) {
    return `\u001b[${setBackground};2;${color.r};${color.g};${color.b};m${str}\u001b[${resetBackground}m`
}

export const black = colorizeFunction({ r: 0, g: 0, b: 0});
export const red = colorizeFunction({ r: 255, g: 0, b: 0});
export const green = colorizeFunction({ r: 0, g: 255, b: 0});
export const yellow = colorizeFunction({ r: 255, g: 255, b: 0});
export const grey = colorizeFunction({ r: 120, g: 120, b: 120});

export const greenBg = colorizeBgFunction({ r: 50, g: 220, b: 0});
export const redBg = colorizeBgFunction({ r: 255, g: 0, b: 0});
export const yellowBg = colorizeBgFunction({ r: 255, g: 255, b: 0});
/*
export const green = colorizeFunction(32);
export const yellow = colorizeFunction(33);
export const blue = colorizeFunction(34);
export const magenta = colorizeFunction(35);
export const cyan = colorizeFunction(36);
export const white = colorizeFunction(37);
export const gray = colorizeFunction(90);
*/

let _ansiRegex;

export function ansiRegex({onlyFirst = false} = {}) {
	const pattern = [
		'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
		'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))'
	].join('|');

	return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

export function stripAnsi(s: string) {
    _ansiRegex = _ansiRegex || ansiRegex();
    return s.replace(_ansiRegex, '');
}
