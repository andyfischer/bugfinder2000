
import { Rope } from '../utils/Rope'
import { LexedText } from './LexedText'

interface Replacement {
    start_pos: number
    end_pos: number
    replaceWith: string
}

export class ModifiedLexedText {
    text: LexedText
    replacements: Replacement[] = []

    constructor(text: LexedText) {
        this.text = text;
    }

    replaceTokenRange(range: { start_pos: number, end_pos: number }, replaceWith: string) {
        this.replacements.push({
            start_pos: range.start_pos,
            end_pos: range.end_pos,
            replaceWith
        });
    }

    finishToString() {
        this.replacements.sort((a,b) => a.start_pos - b.start_pos);

        const original = new Rope(this.text.originalStr);
        const nodes = [];
        let lastCharPos = 0;

        for (const replacement of this.replacements) {

            const charStart = this.text.startCharOfToken(replacement.start_pos);
            const charEnd = this.text.startCharOfToken(replacement.end_pos);

            nodes.push(original.slice(
                lastCharPos,
                charStart,
            ));

            nodes.push(new Rope(replacement.replaceWith));
            lastCharPos = charEnd;
        }

        nodes.push(original.slice(lastCharPos, original.length));

        const result = Rope.join(nodes);
        return result.toFlatString();
    }
}
