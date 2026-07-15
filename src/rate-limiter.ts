export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private timestamps: number[] = [];

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((time) => now - time < this.windowMs);

      if (this.timestamps.length < this.maxRequests) {
        this.timestamps.push(now);
        return;
      }

      const oldest = this.timestamps[0] ?? now;
      const waitMs = this.windowMs - (now - oldest) + 25;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}