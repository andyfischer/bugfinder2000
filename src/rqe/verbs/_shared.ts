
import { Task } from '../Step'

export interface Verb {
    name?: string
    run?: (step: Task) => void
}
