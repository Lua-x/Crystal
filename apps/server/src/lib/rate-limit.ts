export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Milliseconds until the current window resets. */
  retryAfterMs: number
}

interface Window {
  count: number
  resetAt: number
}

/**
 * In-memory fixed-window limiter. Crystal runs as a single process, so shared
 * storage (Redis etc.) is not needed; limits reset on restart.
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>()
  private lastSweep: number

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.lastSweep = now()
  }

  consume(key: string): RateLimitResult {
    const now = this.now()
    this.sweep(now)

    let window = this.windows.get(key)
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs }
      this.windows.set(key, window)
    }
    window.count += 1

    return {
      allowed: window.count <= this.limit,
      remaining: Math.max(0, this.limit - window.count),
      retryAfterMs: window.resetAt - now,
    }
  }

  reset(key: string): void {
    this.windows.delete(key)
  }

  /** Drops expired windows so the map cannot grow without bound. */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return
    this.lastSweep = now
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key)
    }
  }
}
