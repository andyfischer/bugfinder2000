
import { Task } from '../Step'
import { Table } from '../Table'
import { formatAsCsv } from '../format/csv'

function run(step: Task) {
    if (step.schemaOnly) {
        step.output.done();
        return;
    }

    step.input.callback((result: Table) => {
        const out = [];

        for (const line of formatAsCsv(result, {
            attrs: result.getEffectiveAttrs(),
            includeHeader: true
        })) {
            out.push(line);
        }

        const buffer = Buffer.from(out.join(''));

        step.output.put({ buffer });
        step.output.done();
    });
}

export const to_csv = {
    run,
}

