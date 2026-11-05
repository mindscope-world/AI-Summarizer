import {describe, expect, it} from 'vitest';
import {RateBudget, type Clock} from './rateBudget';

/** A clock whose sleep() advances time instantly, recording each wait. */
function fakeClock(start = 1_000_000) {
  let t = start;
  const sleeps: number[] = [];
  const clock: Clock = {
    now: () => t,
    sleep: async (ms, signal) => {
      signal?.throwIfAborted();
      sleeps.push(ms);
      t += ms;
    },
  };
  return {clock, sleeps, advance: (ms: number) => (t += ms), get now() { return t; }};
}

describe('RateBudget', () => {
  it('does not wait while under the limit', async () => {
    const c = fakeClock();
    const budget = new RateBudget({tokensPerMinute: 1000}, c.clock);
    await budget.reserve(300, 100);
    await budget.reserve(300, 100);
    expect(c.sleeps).toEqual([]);
  });

  it('waits until the oldest reservation leaves the 60s window', async () => {
    const c = fakeClock();
    const budget = new RateBudget({tokensPerMinute: 1000}, c.clock);
    await budget.reserve(500, 100); // t=0, 600 used
    c.advance(10_000);
    await budget.reserve(500, 100); // needs 600 more but only 400 left: wait for the first to expire
    expect(c.sleeps).toHaveLength(1);
    expect(c.sleeps[0]).toBeGreaterThanOrEqual(50_000);
    expect(c.sleeps[0]).toBeLessThanOrEqual(50_100);
  });

  it('enforces a separate, smaller output-token cap', async () => {
    const c = fakeClock();
    const budget = new RateBudget({tokensPerMinute: 100_000, outputTokensPerMinute: 900}, c.clock);
    await budget.reserve(1000, 600);
    await budget.reserve(1000, 600); // input is nowhere near the cap, but output would reach 1200 > 900
    expect(c.sleeps).toHaveLength(1);
    expect(c.sleeps[0]).toBeGreaterThan(59_000);
  });

  it('lets an oversized single call through once the window is empty instead of deadlocking', async () => {
    const c = fakeClock();
    const budget = new RateBudget({tokensPerMinute: 1000}, c.clock);
    await budget.reserve(5000, 0);
    expect(c.sleeps).toEqual([]);
    await budget.reserve(200, 0); // must wait for the big one to expire
    expect(c.sleeps).toHaveLength(1);
  });

  it('frees budget immediately when a reservation is settled lower or cancelled', async () => {
    const c = fakeClock();
    const budget = new RateBudget({tokensPerMinute: 1000}, c.clock);
    const a = await budget.reserve(900, 0);
    a.settle({total: 100, output: 0}); // the call used far less than estimated
    await budget.reserve(800, 0);
    expect(c.sleeps).toEqual([]);

    const b = await budget.reserve(100, 0);
    b.cancel();
    await budget.reserve(100, 0);
    expect(c.sleeps).toEqual([]);
  });

  it('reports the wait so callers can tell the user', async () => {
    const c = fakeClock();
    const budget = new RateBudget({tokensPerMinute: 1000}, c.clock);
    await budget.reserve(900, 0);
    const waits: number[] = [];
    await budget.reserve(500, 0, {onWait: (ms) => waits.push(ms)});
    expect(waits.length).toBeGreaterThan(0);
    expect(waits[0]).toBeGreaterThan(50_000);
  });

  it('stops waiting when aborted', async () => {
    const c = fakeClock();
    const budget = new RateBudget({tokensPerMinute: 1000}, c.clock);
    await budget.reserve(900, 0);
    const controller = new AbortController();
    controller.abort(new Error('client left'));
    await expect(budget.reserve(500, 0, {signal: controller.signal})).rejects.toThrow('client left');
  });

  it('has no limits when none are configured', async () => {
    const c = fakeClock();
    const budget = new RateBudget({}, c.clock);
    for (let i = 0; i < 20; i++) await budget.reserve(100_000, 100_000);
    expect(c.sleeps).toEqual([]);
  });
});
