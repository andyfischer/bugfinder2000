
import { openAsyncIterator } from './rqe/utils/openAsyncIterator'
import { formatItem, QueryTuple } from './rqe'
import Puppeteer, { Browser, Page } from 'puppeteer'
import { TestContext, GlobalTestSettings } from './TestContext'

interface PuppeteerJobRequest {
    run: (ctx: TestContext) => Promise<void>
    headless?: boolean
    saveResultsTo?: string
    moreSettings?: QueryTuple
    choiceDefinitions?: any
}

class PuppeteerJob {

    sendRequest: (req: PuppeteerJobRequest) => void

    async start() {

        const { send, iterator } = openAsyncIterator<PuppeteerJobRequest>()
        this.sendRequest = send;

        let browser: Browser;

        for await (const req of iterator) {

            let { saveResultsTo, headless } = req;
            if (headless == null) headless = true;

            if (req.moreSettings) {
                for (const tag of req.moreSettings.tags) {
                    switch (tag.attr) {
                    case 'headless':
                        headless = true;
                        break;
                    case 'window':
                        headless = false;
                        break;
                    }
                }
            }

            console.log(`Launching Puppeteer (${formatItem({saveResultsTo,headless})})`);

            if (!browser) {
                browser = await Puppeteer.launch({

                    // big list of command line args: https://peter.sh/experiments/chromium-command-line-switches/
                    args: [

                      // Disabling DialMediaRouteProvider helps reduce the popup for "do you want
                      // to allow Chromium to accept network connections"
                      '--disable-features=DialMediaRouteProvider,IsolateOrigins,site-per-process',

                    ],
                    headless,
                });
            }

            const ctx = new TestContext(browser, {
                saveResultsTo: req.saveResultsTo,
                choiceDefinitions: req.choiceDefinitions,
            });

            await ctx.prepare();

            try {
                await req.run(ctx);
            } catch (err) {
                console.error(err);
            }
        }
    }
}

export let _puppeterJob;

export function startPuppeteerRunner() {
    if (_puppeterJob)
        throw new Error("already started");

     _puppeterJob = new PuppeteerJob();
     _puppeterJob.start();
}

export function runWithPuppeteer(req: PuppeteerJobRequest) {
    _puppeterJob.sendRequest(req);
}

process.on('exit', () => {
    if (_puppeterJob?.browser) {
        console.log('closing browser (got exit message)');
        _puppeterJob.browser.close().catch(() => {});
    }
});
