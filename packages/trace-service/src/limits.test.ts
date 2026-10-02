import { describe, expect, it } from 'vitest';
import { BusyError, Gate, RateLimiter, originMatcher } from './limits';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('Gate', () => {
  it('runs at most `max` at once, queues up to `maxQueued`, refuses the rest', async () => {
    const gate = new Gate(1, 1);
    const first = deferred();
    const a = gate.run(() => first.promise.then(() => 'a'));
    const b = gate.run(async () => 'b');
    expect(gate.active).toBe(1);
    expect(gate.queued).toBe(1);
    await expect(gate.run(async () => 'c')).rejects.toBeInstanceOf(BusyError);

    first.resolve();
    expect(await a).toBe('a');
    expect(await b).toBe('b');
    expect(gate.active).toBe(0);
    expect(gate.queued).toBe(0);
  });

  it('releases the slot when the task throws', async () => {
    const gate = new Gate(1, 0);
    await expect(gate.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await gate.run(async () => 'ok')).toBe('ok');
  });
});

describe('RateLimiter', () => {
  it('allows a burst of `perMinute`, then refills over time', () => {
    let now = 0;
    const rl = new RateLimiter(3, () => now);
    expect([rl.allow('ip'), rl.allow('ip'), rl.allow('ip'), rl.allow('ip')]).toEqual([true, true, true, false]);
    expect(rl.allow('other')).toBe(true); // per client
    now += 20_000; // a third of a minute → one token back
    expect(rl.allow('ip')).toBe(true);
    expect(rl.allow('ip')).toBe(false);
  });

  it('is off at 0', () => {
    const rl = new RateLimiter(0);
    for (let i = 0; i < 100; i++) expect(rl.allow('ip')).toBe(true);
  });
});

describe('originMatcher', () => {
  it('echoes exact and wildcard matches, rejects everything else', () => {
    const m = originMatcher(['https://visionds.app', 'https://visionds-*-team.vercel.app']);
    expect(m('https://visionds.app')).toBe('https://visionds.app');
    expect(m('https://visionds-git-x-team.vercel.app')).toBe('https://visionds-git-x-team.vercel.app');
    expect(m('https://evil.vercel.app')).toBeNull();
    expect(m('https://visionds.app.evil.com')).toBeNull();
    expect(m(undefined)).toBeNull();
  });

  it('a lone * allows any origin', () => {
    expect(originMatcher(['*'])('https://anything.example')).toBe('*');
  });
});
