/** The service is at capacity: every slot is running and the queue is full. */
export class BusyError extends Error {
  constructor() {
    super('trace service is busy — try again in a moment');
  }
}

/**
 * Concurrency gate. A trace pins a CPU for seconds (compiler + debugger), so
 * at most `max` run at once and up to `maxQueued` wait; past that a request is
 * refused immediately (429) rather than piling up behind a growing queue.
 */
export class Gate {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    readonly max: number,
    readonly maxQueued: number,
  ) {}

  get active(): number {
    return this.running;
  }

  get queued(): number {
    return this.waiting.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) {
      if (this.waiting.length >= this.maxQueued) throw new BusyError();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running++;
    }
    try {
      return await fn();
    } finally {
      // Hand the slot straight to the next waiter, or release it.
      const next = this.waiting.shift();
      if (next) next();
      else this.running--;
    }
  }
}

/**
 * Per-client token bucket: `perMinute` requests, refilled continuously.
 * In-memory and per machine — enough to stop one client hammering the
 * compiler; it is not a global quota. `perMinute <= 0` disables it.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    if (this.perMinute <= 0) return true;
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.perMinute, at: t };
    b.tokens = Math.min(this.perMinute, b.tokens + ((t - b.at) / 60_000) * this.perMinute);
    b.at = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.sweep(t);
    return ok;
  }

  /** Drop buckets that have refilled completely — they carry no state. */
  private sweep(t: number) {
    for (const [k, b] of this.buckets) {
      if (b.tokens + ((t - b.at) / 60_000) * this.perMinute >= this.perMinute) this.buckets.delete(k);
    }
  }
}

/**
 * Origin allowlist. Entries are exact origins or `*` wildcards within one
 * (`https://*.vercel.app`); a lone `*` allows any origin (local dev).
 */
export function originMatcher(patterns: string[]): (origin: string | undefined) => string | null {
  if (patterns.includes('*')) return () => '*';
  const res = patterns.map(
    (p) => new RegExp('^' + p.split('*').map(escapeRe).join('[^/]*') + '$'),
  );
  return (origin) => (origin && res.some((r) => r.test(origin)) ? origin : null);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
