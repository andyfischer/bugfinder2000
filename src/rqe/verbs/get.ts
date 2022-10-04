
import { Task } from '../Step'

function run(step: Task) {
    throw new Error("don't call get.run");
}

export const get = {
    run,
    name: 'get',
}
