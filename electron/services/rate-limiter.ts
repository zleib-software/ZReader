export class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private minIntervalMs: number;
  private lastRequestTime = 0;

  constructor(maxRequestsPerSecond: number = 4) {
    // We use 4 requests per second to stay comfortably below MangaDex's 5 req/s hard cap
    this.minIntervalMs = Math.ceil(1000 / maxRequestsPerSecond);
  }

  public async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await fn();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.minIntervalMs) {
        await new Promise(r => setTimeout(r, this.minIntervalMs - elapsed));
      }

      this.lastRequestTime = Date.now();
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (err) {
          console.error('Rate limited task execution error:', err);
        }
      }
    }

    this.processing = false;
  }
}

export const globalMangaDexLimiter = new RateLimiter(4);
