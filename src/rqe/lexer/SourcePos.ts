
export default interface SourcePos {
    filename?: string
    lineStart: number
    lineEnd: number
    columnStart: number
    columnEnd: number
    posStart: number
    posEnd: number
}

export function sourcePosToString(pos: SourcePos) {
    const filename = pos.filename || '(no filename)';

    return `${filename}:${pos.lineStart}:${pos.columnStart}`
}
