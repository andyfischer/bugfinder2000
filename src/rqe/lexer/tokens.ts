
import TokenDef from './TokenDef'

export const t_lparen: TokenDef = {
    name: "lparen",
    str: "(",
    bracketPairsWith: 'rparen',
    bracketSide: 'left'
}

export const t_rparen: TokenDef = {
    name: "rparen",
    str: ")",
    bracketPairsWith: 'lparen',
    bracketSide: 'right'
}

export const t_lbracket: TokenDef = {
    name: "lbracket",
    str: "[",
    bracketPairsWith: 'rbracket',
    bracketSide: 'left'
}

export const t_rbracket: TokenDef = {
    name: "rbracket",
    str: "]",
    bracketPairsWith: 'lbracket',
    bracketSide: 'right'
}

export const t_lbrace: TokenDef = {
    name: "lbrace",
    str: "{",
    bracketPairsWith: 'rbrace',
    bracketSide: 'left'
}

export const t_rbrace: TokenDef = {
    name: "rbrace",
    str: "}",
    bracketPairsWith: 'lbrace',
    bracketSide: 'right'
}

export const t_gthan: TokenDef = {
    name: "gthan",
    str: ">",
}

export const t_gthaneq: TokenDef = {
    name: "gthaneq",
    str: ">=",
}

export const t_lthan: TokenDef = {
    name: "lthan",
    str: "<",
}

export const t_lthaneq: TokenDef = {
    name: "lthaneq",
    str: "<=",
}

export const t_slash = {
    name: "slash",
    str: "/"
}

export const t_dot = {
    name: "dot",
    str: "."
}

export const t_comma = {
    name: "comma",
    str: ","
}

export const t_semicolon = {
    "name": "semicolon",
    "str": ";"
}

export const t_colon = {
    "name": "colon",
    "str": ":"
}

export const t_plus = {
    name: "plus",
    str: "+"
}

export const t_dash = {
    name: "dash",
    str: "-"
}

export const t_double_dash = {
    name: "double-dash",
    str: "--"
}

export const t_right_arrow = {
    name: "right-arrow",
    str: "->"
}

export const t_right_fat_arrow = {
    name: "right-fat-arrow",
    str: "=>"
}

export const t_star = {
    name: "star",
    str: "*"
}

export const t_equals = {
    name: "equals",
    str: "="
}

export const t_double_equals = {
    name: "double-equals",
    str: "=="
}

export const t_hash = {
    name: "hash",
    str: "#"
}

export const t_percent = {
    name: "percent",
    str: "%"
}

export const t_dollar = {
    name: "dollar",
    str: "$"
}

export const t_tilde = {
    name: "tilde",
    str: "~"
}

export const t_exclaim = {
    name: "exclamation",
    str: "!"
}

export const t_bar = {
    name: "bar",
    str: "|"
}

export const t_double_bar = {
    name: "double_bar",
    str: "||"
}

export const t_amp = {
    name: "amp",
    str: "&"
}

export const t_double_amp = {
    name: "double_amp",
    str: "&&"
}

export const t_question = {
    name: "question",
    str: "?"
}

export const t_ident = {
    name: "ident"
}

export const t_plain_value = {
    name: "plain_value"
}

export const t_integer = {
    name: "integer"
}

export const t_space = {
    name: "space"
}

export const t_newline = {
    name: "newline",
    str: '\n'
}

export const t_quoted_string = {
    name: "quoted_string",
}

export const t_line_comment = {
    name: 'line_comment'
}

export const t_unrecognized = {
    name: "unrecognized"
}

export const everyToken: TokenDef[] = [
    t_lparen,
    t_rparen,
    t_lbracket,
    t_rbracket,
    t_lbrace,
    t_rbrace,
    t_gthan,
    t_lthan,
    t_slash,
    t_dot,
    t_comma,
    t_semicolon,
    t_colon,
    t_plus,
    t_dash,
    t_double_dash,
    t_right_arrow,
    t_star,
    t_equals,
    t_double_equals,
    t_hash,
    t_percent,
    t_dollar,
    t_tilde,
    t_exclaim,
    t_bar,
    t_double_bar,
    t_amp,
    t_double_amp,
    t_question,
    t_ident,
    t_integer,
    t_plain_value,
    t_space,
    t_newline,
    t_quoted_string,
    t_line_comment,
    t_unrecognized
];

export const tokenFromSingleCharCode: {[code:string]: TokenDef} = {}

const tokensByName: {[name:string]: TokenDef} = {}

for (const token of everyToken) {
    if (!token.name)
        throw new Error("token is missing name: " + token);

    if (token.str && token.str.length === 1) {
        tokenFromSingleCharCode[token.str.charCodeAt(0)] = token;
    }

    if (tokensByName[token.name])
        throw new Error("duplicate token name: " + token.name);

    tokensByName[token.name] = token;
}
