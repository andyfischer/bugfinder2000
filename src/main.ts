
import { runCommandLineProcess } from './rqe/node'
import { startPuppeteerRunner, runWithPuppeteer } from './PuppeteerRunner'
import { TestContext } from './TestContext'
import { parseCommandLineArgs } from './rqe/utils/parseCommandLineArgs'

interface MainSettings {
    entryPoint: (ctx: TestContext) => Promise<void>
    choiceDefinitions?: string
}

export function main({ entryPoint, choiceDefinitions }: MainSettings) {
    runCommandLineProcess({
        startRepl: {
            prompt: 'bugfinder2000~ '
        },
        onReady() {
            const settingsFromCli = parseCommandLineArgs(process.argv.slice(2));

            startPuppeteerRunner();

            runWithPuppeteer({
                moreSettings: settingsFromCli,
                saveResultsTo: 'results.db',
                choiceDefinitions ,
                async run(ctx) {
                    await entryPoint(ctx);
                }
            })
        }
    });
}
