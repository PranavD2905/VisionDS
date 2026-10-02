import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { availableParallelism } from 'node:os';
import { TestCaseSchema } from '@visionds/trace-schema';
import { z } from 'zod';
import { BusyError, Gate, RateLimiter, originMatcher } from './limits';
import { supportedLanguages, traceCase } from './trace';

/**
 * `systemCode` is the call site; the entry point is derived from it, so a
 * client never sends one (an old client's `entry` field is ignored).
 */
const RequestSchema = z.object({
  language: z.string(),
  code: z.string(),
  systemCode: z.string().optional(),
  testCase: TestCaseSchema,
});

export interface ServerConfig {
  /** CORS allowlist — exact origins or `*` wildcards; `['*']` allows any (dev). */
  allowedOrigins: string[];
  /** Traces running at once. */
  maxConcurrent: number;
  /** Traces allowed to wait for a slot before requests get 429. */
  maxQueued: number;
  /** Trace requests per client per minute; 0 disables. */
  rateLimitPerMinute: number;
  /** Header carrying the real client IP behind a proxy (`fly-client-ip`); unset = socket address. */
  clientIpHeader?: string;
  log: (line: Record<string, unknown>) => void;
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Read the config from the environment; every knob has a dev-friendly default. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const n = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
  const maxConcurrent = Math.max(1, n(env.MAX_CONCURRENT_TRACES, availableParallelism()));
  const origins = list(env.ALLOWED_ORIGINS);
  return {
    allowedOrigins: origins.length ? origins : ['*'],
    maxConcurrent,
    maxQueued: Math.max(0, n(env.MAX_QUEUED_TRACES, maxConcurrent * 2)),
    rateLimitPerMinute: n(env.RATE_LIMIT_PER_MINUTE, 0),
    clientIpHeader: env.CLIENT_IP_HEADER?.toLowerCase() || undefined,
    log: (line) => console.log(JSON.stringify({ t: new Date().toISOString(), ...line })),
  };
}

/** A malformed or oversized request — the client's problem, never ours. */
class BadRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new BadRequestError('request body too large', 413);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Read and parse a JSON body. Kept separate from the handlers' own try/catch
 * so transport-level failures (oversized body, malformed JSON) are classified
 * as client errors instead of falling into the 500 branch meant for genuine
 * service faults.
 */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError('body is not valid JSON', 400);
  }
}

/**
 * The trace service. One endpoint, `POST /trace`, mirrors the client-side
 * runner contract: given {language, code, systemCode?, testCase} it returns an
 * ExecutionTrace. Submission problems are `error` verdicts in a 200 reply;
 * a non-2xx status means the request or the service itself was at fault. Runs compilers and a debugger locally.
 *
 * NOTE: this executes student-submitted code. Beyond local dev it MUST run in
 * the container image (packages/trace-service/Dockerfile), which turns on the
 * per-run sandbox in sandbox.ts: unprivileged uid, rlimits, no network.
 */
export function createTraceServer(overrides: Partial<ServerConfig> = {}): Server {
  const cfg = { ...configFromEnv(), ...overrides };
  const allowOrigin = originMatcher(cfg.allowedOrigins);
  const gate = new Gate(cfg.maxConcurrent, cfg.maxQueued);
  const limiter = new RateLimiter(cfg.rateLimitPerMinute);

  return createServer(async (req, res) => {
    // CORS: echo the origin only when it is allowed. A browser on any other
    // origin gets no Allow-Origin header and cannot read the reply.
    const origin = allowOrigin(req.headers.origin);
    const cors: Record<string, string> = {
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    };
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...cors, ...headers });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/health') {
      return json(200, {
        ok: true,
        languages: supportedLanguages(),
        active: gate.active,
        queued: gate.queued,
      });
    }
    if (req.method !== 'POST' || req.url !== '/trace') {
      return json(404, { error: 'not found' });
    }

    const hdr = cfg.clientIpHeader ? req.headers[cfg.clientIpHeader] : undefined;
    const client = (Array.isArray(hdr) ? hdr[0] : hdr) ?? req.socket.remoteAddress ?? 'unknown';
    if (!limiter.allow(client)) {
      return json(429, { error: 'too many requests — slow down', kind: 'rate' }, { 'Retry-After': '10' });
    }

    const started = Date.now();
    try {
      const parsed = RequestSchema.safeParse(await readJson(req));
      if (!parsed.success) {
        return json(400, { error: 'invalid request', detail: parsed.error.message });
      }
      const { language, code, systemCode, testCase } = parsed.data;
      const trace = await gate.run(() => traceCase(language, code, testCase, systemCode));
      // Never log the code or the testcase — only the shape of the run.
      cfg.log({
        event: 'trace',
        language,
        verdict: trace.result.verdict,
        steps: trace.steps.length,
        ms: Date.now() - started,
      });
      return json(200, trace);
    } catch (e) {
      if (e instanceof BadRequestError) {
        return json(e.status, { error: e.message, kind: 'request' });
      }
      if (e instanceof BusyError) {
        cfg.log({ event: 'busy', active: gate.active, queued: gate.queued });
        return json(429, { error: e.message, kind: 'busy' }, { 'Retry-After': '5' });
      }
      cfg.log({ event: 'fault', error: e instanceof Error ? e.message : String(e), ms: Date.now() - started });
      // Internal failure (compiler/debugger missing, stepper crash) — distinct
      // from a bad submission, which traceCase already returns as an error verdict.
      return json(500, { error: e instanceof Error ? e.message : String(e), kind: 'service' });
    }
  });
}
