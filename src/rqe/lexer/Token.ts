
import TokenDef from './TokenDef'

export default interface Token {
    match: TokenDef
    length: number
    tokenIndex: number
    startPos: number
    endPos: number
    lineStart: number
    columnStart: number
    leadingIndent: number
    pairsWithIndex?: number
}
