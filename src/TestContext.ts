
import Puppeteer, { Browser, Page } from 'puppeteer'
import { ChoicePicker, RandomChoicePicker, Option, OptionList } from './ChoicePicker'
import { SqliteStorage } from './SqliteStorage'

export interface GlobalTestSettings {
    saveResultsTo?: string
    choiceDefinitions?: string
}

export class TestContext {
    browser: Browser
    page: Page
    choicePicker: ChoicePicker
    rootUrl: string
    settings: GlobalTestSettings
    storage?: SqliteStorage
    id: number
    current_page_visit: number

    constructor(browser: Browser, settings: GlobalTestSettings) {
        this.browser = browser;
        this.settings = settings;
        this.choicePicker = new RandomChoicePicker(this);

        if (!settings.saveResultsTo)
            throw new Error("saveResultsTo is currently required");

        this.storage = new SqliteStorage(settings.saveResultsTo, this);
    }

    async prepare() {
        await this.storage.prepare();

        const { id } = await this.storage.save_test_context()
        this.id = id;

        this.page = await this.browser.newPage();

        this.page.on('console', msg => {
            this.storage.save_console_log(msg.type(), msg.text());
        });
        this.page.on('pageerror', ({message}) => {
            this.storage.save_page_error(message);
        });
        this.page.on('response', async (res) => {
            this.storage.save_page_response(res.status(), res.url(), 0);
        });
        this.page.on('request', async (req) => {
            this.storage.save_page_request(req.url());
        });
        this.page.on('requestfailed', async (req) => {
            this.storage.save_page_request_failed(req.url());
        });
        this.page.on('requestfinished', async (req) => {
            this.storage.save_page_request_finished(req.url());
        });
    }

    choose(label: string, options?: OptionList) {
        return this.choicePicker.pickOne(label, options);
    }

    log(s: string) {
        console.log(s);
    }

    async waitUntil(callback: () => boolean | Promise<boolean>, options?: { timeout?: number }) {
        let elapsed = 0;
        let timeout = options?.timeout || 5000;

        while (elapsed < timeout) {
            if (await callback())
                return;

            await new Promise(resolve => setTimeout(resolve, 1000));
            elapsed += 1000;
        }

        throw new Error(`Waiting failed: ${timeout}ms exceeded`);
    }

    async visit(path: string, options?: any) {
        const fullPath = (this.rootUrl || '') + path
        this.log('Navigate to: ' + fullPath);
        const { id } = await this.storage.save_page_visit(path);
        this.current_page_visit = id;
        await this.page.goto(fullPath, options);
    }
}
