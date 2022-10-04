/*
   Helper class to limit the number of concurrent actions.
*/

export class ConcurrencyPool {
  nextId = 1;
  active = new Set<number>();
  activeLimit = 400;

  waitingForNext: Promise<void>
  resolveNext: () => void

  constructor(activeLimit: number) {
    this.activeLimit = activeLimit;
  }

  // Queue up a single callback to run. If we're at the concurrency limit then this
  // function will block, and we'll wait to get below the limit before starting it.

  async run(callback: () => Promise<any>) {
    while (this.active.size >= this.activeLimit) {
      await this.waitForNextFinish();
    }

    const id = this.nextId;
    this.nextId++;
    this.active.add(id);

    const promise = callback();
    
    return promise
        .finally(() => {
            this.active.delete(id);

            if (this.waitingForNext) {
                const resolve = this.resolveNext;
                this.waitingForNext = null;
                this.resolveNext = null;
                resolve();
            }
        });
  }

  async finish() {
    while (this.active.size > 0) {
      await this.waitForNextFinish();
    }
  }

  async waitForNextFinish() {
      if (!this.waitingForNext) {
          this.waitingForNext = new Promise<void>(r => { this.resolveNext = r });
      }

      await this.waitingForNext;
  }
}

