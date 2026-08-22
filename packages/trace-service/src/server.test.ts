import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTraceServer } from './server';
import { getDefaultSystemCode } from './trace';
import { TraceUserError } from './adapters/types';

let base: string;
const server = createTraceServer();

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    }),
);
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = async (path: string, body: string) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return { status: res.status, json: (await res.json()) as { error?: string; kind?: string } };
};

describe('POST /system-code error classification', () => {
  // The whole point of the 4xx work: an ordinary submission mistake must be
  // distinguishable from the trace service being broken.
  it('reports a C++ submission with no entry point as 422, not 500', async () => {
    const { status, json } = await post(
      '/system-code',
      JSON.stringify({ language: 'cpp', code: 'int x = 1;' }),
    );
    expect(status).toBe(422);
    expect(json.kind).toBe('submission');
  });

  it('reports a Java submission with no Solution class as 422, not 500', async () => {
    const { status, json } = await post(
      '/system-code',
      JSON.stringify({ language: 'java', code: 'class Nope { public int f() { return 1; } }' }),
    );
    expect(status).toBe(422);
    expect(json.kind).toBe('submission');
    expect(json.error).toMatch(/Solution/);
  });

  it('reports an unsupported language as 422', async () => {
    const { status, json } = await post(
      '/system-code',
      JSON.stringify({ language: 'rust', code: 'fn main() {}' }),
    );
    expect(status).toBe(422);
    expect(json.kind).toBe('submission');
  });

  it('reports malformed JSON as 400, not 500', async () => {
    const { status, json } = await post('/system-code', '{not json');
    expect(status).toBe(400);
    expect(json.kind).toBe('request');
  });

  it('reports a schema-invalid body as 400', async () => {
    const { status } = await post('/system-code', JSON.stringify({ language: 'cpp' }));
    expect(status).toBe(400);
  });

  it('reports an oversized body as 413', async () => {
    const { status, json } = await post(
      '/trace',
      JSON.stringify({ language: 'cpp', code: 'x'.repeat(1_000_050) }),
    );
    expect(status).toBe(413);
    expect(json.kind).toBe('request');
  });

  it('malformed JSON on /trace is 400 too', async () => {
    const { status, json } = await post('/trace', 'nope');
    expect(status).toBe(400);
    expect(json.kind).toBe('request');
  });
});

describe('detector errors are normalized to user errors', () => {
  // Regression: findCppEntry/findJavaEntry throw plain Error, so without
  // normalizing at the generator boundary the HTTP layer's 422 branch never
  // fired for the single most common failure.
  it('wraps a plain detector Error as TraceUserError', () => {
    expect(() => getDefaultSystemCode('cpp', 'int x = 1;')).toThrow(TraceUserError);
    expect(() => getDefaultSystemCode('java', 'class Nope {}')).toThrow(TraceUserError);
  });
});
