
import { Graph } from './Graph'
import { Table } from './Table'

export type LogCategory = 'planning' | 'execution' | 'subprocess'

export class EmptyLoggingSubsystem {
    isEnabled() { return false }
    put(category: LogCategory, text: string) {}
    enable(category: string) {}
}

interface LogCategoryEnabled {
    category: string
    enabled: boolean
}

export class ConsoleLoggingSubsystem {

    categoryEnabled: Table<LogCategoryEnabled>
    isEnabled() { return true }

    constructor(graph: Graph) {
        this.categoryEnabled = graph.newTable({
            attrs: {
                category: {},
                enabled: {}
            },
            funcs: ['category -> enabled'],
        });
    }

    enable(category: string) {
        this.categoryEnabled.put({ category: category as LogCategory, enabled: true });
    }

    put(category: LogCategory, text: string) {
        const setting = this.categoryEnabled.one({ category });

        if (setting && setting.enabled)
            console.log(`[${category}] ${text}`);
    }
}

export function setupLoggingSubsystem(graph: Graph) {
    graph.logging = new ConsoleLoggingSubsystem(graph);
}
