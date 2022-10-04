
import { tokenizeString, TokenIterator,
    t_lparen, t_rparen, t_comma, t_semicolon } from '../../lexer'

export interface CreateTableColumn {
    name: string
    definition: string
}

export interface CreateTable {
    t: 'create_table'
    name: string
    columns: CreateTableColumn[]
    references: string[]
}

export interface InsertItem {
    t: 'insert_item'
    table_name: string
    columns: string[]
    values: string[]
}

export type SqlStatement = CreateTable | InsertItem

function createTable(it: TokenIterator): SqlStatement {
    it.consume();
    it.consume();

    const name = it.consumeAsText();
    const out: SqlStatement = {
        t: 'create_table',
        name,
        columns: [],
        references: [],
    }

    it.consume(t_lparen);

    while (!it.finished()) {
        // Each column definition
        if (it.tryConsume(t_rparen))
            break;

        if (it.nextText().toLowerCase() === 'foreign' && it.nextText(1).toLowerCase() === 'key') {
            const tokens = [];
            let parenDepth = 0;

            while (!it.finished()) {
                if (it.nextIs(t_lparen))
                    parenDepth--;
                if (it.nextIs(t_rparen))
                    parenDepth++;

                if (it.nextIs(t_comma))
                    break;
                if (parenDepth >= 1)
                    break;

                tokens.push(it.consumeAsText());
            }

            out.references.push(tokens.join(' '));
            continue;
        }

        const name = it.consumeAsText();

        let tokens: string[] = []
        let parenDepth = 0;

        while (!it.finished()) {
            // Each token as part of the definition
            if (it.nextIs(t_lparen))
                parenDepth--;
            if (it.nextIs(t_rparen))
                parenDepth++;

            if (it.tryConsume(t_comma))
                break;
            if (parenDepth >= 1)
                break;

            tokens.push(it.consumeAsText());
        }

        out.columns.push({
            name,
            definition: tokens.join(' '),
        });
    }

    return out;
}

function insertItem(it: TokenIterator): SqlStatement {
    it.consume();
    it.consume();

    const table_name = it.consumeAsText();

    const columns = [];
    it.consume(t_lparen);

    while (!it.finished() && !it.tryConsume(t_rparen)) {
        columns.push(it.consumeAsText());
        it.tryConsume(t_comma);
    }

    if (it.consumeAsText() !== 'values')
        throw new Error("expected keyword: values, saw: " + it.nextText(-1));

    const values = [];
    it.consume(t_lparen);
    while (!it.finished() && !it.tryConsume(t_rparen)) {
        values.push(it.consumeAsText());
        it.tryConsume(t_comma);
    }

    it.tryConsume(t_semicolon);

    return {
        t: 'insert_item',
        table_name,
        columns,
        values,
    }
}

export function parseSql(sql: string) {
    const tokens = tokenizeString(sql);
    tokens.stripSpacesAndNewlines();
    const it = new TokenIterator(tokens);

    if (it.nextText(0).toLowerCase() === 'create' && it.nextText(1).toLowerCase() === 'table') {
        const statement = createTable(it);
        return statement;
    }

    if (it.nextText(0).toLowerCase() === 'insert' && it.nextText(1).toLowerCase() === 'into') {
        const statement = insertItem(it);
        return statement;
    }

    throw new Error(`unrecognized statement ${it.nextText(0)} ${it.nextText(1)}`);
}
