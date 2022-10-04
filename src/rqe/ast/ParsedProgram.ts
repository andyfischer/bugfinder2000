

import { graphTablesToString } from '../Debug'
import { LexedText } from '../lexer'
import { ProgramGraph, Block } from './ProgramGraph'

export class ParsedProgram extends ProgramGraph {

    text: LexedText

    constructor(text?: LexedText) {
        super();

        this.text = text;

        this.statements.addChangeListener(change => {
            switch (change.verb) {
                case 'delete':
                    const { block_id } = change.item;
                    this.markBlockModified(block_id);
                    break;
            }
        });
    }

    markStatementModified(statement_id: number) {
        for (const statement of this.statements.where({ id: statement_id })) {
            if (!statement.has_modified) {
                statement.has_modified = true;
                this.markBlockModified(statement.block_id);
            }
        }
    }

    markBlockModified(block_id: number) {
        for (const block of this.blocks.where({ id: block_id })) {
            if (!block.has_modified) {
                block.has_modified = true;
                if (block.parent_block_id)
                    this.markBlockModified(block.parent_block_id);
                if (block.parent_statement_id)
                    this.markStatementModified(block.parent_statement_id);
            }
        }
    }

    replaceStatementText(statement_id: number, text: string) {
        this.statements.one({ id: statement_id }).replacement_text = text;
        this.markStatementModified(statement_id);
    }

    debugAddSourceText(text: LexedText) {
        for (const table of this.graph.tables.values()) {
            for (const item of table) {
                if (item.start_pos !== undefined)
                    item.source = this.getNodeText(item);
            }
        }
    }

    getNodeText(range: { start_pos: number, end_pos: number }) {
        return this.text.getTextRange(range.start_pos, range.end_pos);
    }

    backToSourceString() {
        // console.log('back to source..', this.dump())
        const block = this.blocks.one({id: 1});
        if (!block)
            throw new Error("internal error: can't find block with id=1 ?");
        const strs = Array.from(blockBackToSourceString(this, block));
        return strs.join('');
    }

    str() {
        return graphTablesToString(this.graph, {reproducible: true});
    }

    dump() {
        return graphTablesToString(this.graph, {reproducible: true});
    }
}

export function* blockBackToSourceString(program: ParsedProgram, block: Block) {

    if (!block.has_modified) {
        // Shortcut, no modifications.
        yield program.getNodeText(block);
        return;
    }

    for (const statement of program.statements.where({ block_id: block.id })) {
        if (statement.replacement_text) {
            yield statement.replacement_text;
            continue;
        }

        // Does this statement have a child block?
        const child_block = program.blocks.one({ parent_statement_id: statement.id });

        if (child_block) {
            yield program.getNodeText({ start_pos: statement.start_pos, end_pos: child_block.statements_start_pos });
            yield* blockBackToSourceString(program, child_block);
            yield program.getNodeText({ start_pos: child_block.statements_end_pos, end_pos: statement.end_pos });
        } else {
            yield program.getNodeText(statement);
        }
    }
}
