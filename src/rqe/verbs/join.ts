
import { Task } from '../Step'

const VerboseLog = false;

function run(step: Task) {
    throw new Error("don't call join.run");
}

export const join = {
    name: 'join',
    run,
}
