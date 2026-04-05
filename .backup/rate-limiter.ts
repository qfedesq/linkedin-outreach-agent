interface BucketConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
  minDelay: number; // minimum ms between requests
  maxDelay: number; // maximum ms between requests
}

interface Bucket {
  tokens: number;
  lastRefill: number;
  config: BucketConfig;
}

const BUCKET_CONFIGS: Record<string, BucketConfig> = {
  profile: { maxTokens: 5, refillRate: 0.33, minDelay: 2400, maxDelay: 3600 },
  invitation: { maxTokens: 2, refillRate: 0.022, minDelay: 30000, maxDelay: 60000 },
  message: { maxTokens: 3, refillRate: 0.033, minDelay: 24000, maxDelay: 36000 },
  search: { maxTokens: 3, refillRate: 0.2, minDelay: 1000, maxDelay: 2000 },
  global: { maxTokens: 100, refillRate: 0.028, minDelay: 200, maxDelay: 500 },
};

class RateLimiter {
  private buckets: Map<string, Bucket> = new Map();
  private halted = false;
  private haltReason: string | null = null;

  private getBucket(type: string): Bucket {
    if (!this.buckets.has(type)) {
      const config = BUCKET_CONFIGS[type] || BUCKET_CONFIGS.global;
      this.buckets.set(type, {
        tokens: config.maxTokens,
        lastRefill: Date.now(),
        config,
      });
    }
    return this.buckets.get(type)!;
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(
      bucket.config.maxTokens,
      bucket.tokens + elapsed * bucket.config.refillRate
    );
    bucket.lastRefill = now;
  }

  private randomDelay(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  async acquire(type: string): Promise<void> {
    if (this.halted) {
      throw new Error(`Rate limiter halted: ${this.haltReason}`);
    }

    const bucket = this.getBucket(type);
    const globalBucket = this.getBucket("global");

    this.refill(bucket);
    this.refill(globalBucket);

    // Wait if no tokens available
    while (bucket.tokens < 1 || globalBucket.tokens < 1) {
      const waitTime = this.randomDelay(1000, 3000);
      await new Promise((r) => setTimeout(r, waitTime));
      this.refill(bucket);
      this.refill(globalBucket);
    }

    bucket.tokens -= 1;
    globalBucket.tokens -= 1;

    // Apply random delay to appear human-like
    const delay = this.randomDelay(bucket.config.minDelay, bucket.config.maxDelay);
    await new Promise((r) => setTimeout(r, delay));
  }

  halt(reason: string): void {
    this.halted = true;
    this.haltReason = reason;
  }

  resume(): void {
    this.halted = false;
    this.haltReason = null;
  }

  isHalted(): boolean {
    return this.halted;
  }

  getHaltReason(): string | null {
    return this.haltReason;
  }
}

export const rateLimiter = new RateLimiter();
