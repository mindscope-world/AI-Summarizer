/**
 * A sliding 60-second token budget. Free-tier LLM APIs cap tokens per minute, and hitting the cap
 * turns into 429 errors and long retry stalls. Reserving tokens before each call lets us pace
 * ourselves and tell the user how long the wait will be instead.
 */

export interface BudgetLimits {
  /** Input + output tokens per minute. */
  tokensPerMinute?: number;
  /** Output tokens per minute (some models have a separate, much smaller cap). */
  outputTokensPerMinute?: number;
}

export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal!.reason ?? new Error('aborted'));
      };
      signal?.addEventListener('abort', onAbort, {once: true});
    }),
};

interface Entry {
  at: number;
  total: number;
  output: number;
}

export interface Reservation {
  /** Replace the reservation with what the call really used. */
  settle(actual: {total: number; output: number}): void;
  /** Give the reservation back (the call failed before using tokens). */
  cancel(): void;
}

const WINDOW_MS = 60_000;

export class RateBudget {
  private entries: Entry[] = [];

  constructor(
    private readonly limits: BudgetLimits,
    private readonly clock: Clock = realClock,
  ) {}

  private prune(now: number) {
    this.entries = this.entries.filter((e) => now - e.at < WINDOW_MS);
  }

  /** Milliseconds to wait before `need` more tokens fit under `limit`, given entries currently in the window. */
  private waitFor(need: number, limit: number | undefined, pick: (e: Entry) => number, now: number): number {
    if (!limit) return 0;
    // A single call bigger than the whole limit can never fit; let it through once the window is empty.
    const target = Math.min(need, limit);
    let used = this.entries.reduce((n, e) => n + pick(e), 0);
    if (used + target <= limit) return 0;
    for (const e of [...this.entries].sort((a, b) => a.at - b.at)) {
      used -= pick(e);
      if (used + target <= limit) return Math.max(0, e.at + WINDOW_MS - now);
    }
    return WINDOW_MS;
  }

  /** Waits until the estimated tokens fit in the budget, then reserves them. */
  async reserve(
    input: number,
    output: number,
    opts: {signal?: AbortSignal; onWait?: (ms: number) => void} = {},
  ): Promise<Reservation> {
    const total = input + output;
    for (;;) {
      opts.signal?.throwIfAborted();
      const now = this.clock.now();
      this.prune(now);
      const wait = Math.max(
        this.waitFor(total, this.limits.tokensPerMinute, (e) => e.total, now),
        this.waitFor(output, this.limits.outputTokensPerMinute, (e) => e.output, now),
      );
      if (wait <= 0) break;
      opts.onWait?.(wait);
      await this.clock.sleep(wait + 50, opts.signal);
    }
    const entry: Entry = {at: this.clock.now(), total, output};
    this.entries.push(entry);
    return {
      settle: (actual) => {
        entry.total = actual.total;
        entry.output = actual.output;
      },
      cancel: () => {
        this.entries = this.entries.filter((e) => e !== entry);
      },
    };
  }
}
