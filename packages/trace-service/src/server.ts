import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { TestCaseSchema } from '@visionds/trace-schema';
import { z } from 'zod';
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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(payload);
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
 * NOTE: this executes student-submitted code. For anything beyond local dev it
 * MUST run inside a locked-down sandbox (container, no network, cpu/mem/pids
 * limits, ephemeral fs) — see the deployment notes in the design doc.
 */
export function createTraceServer(): Server {
  return createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, languages: supportedLanguages() });
    }
    if (req.method !== 'POST' || req.url !== '/trace') {
      return json(res, 404, { error: 'not found' });
    }

    try {
      const parsed = RequestSchema.safeParse(await readJson(req));
      if (!parsed.success) {
        return json(res, 400, { error: 'invalid request', detail: parsed.error.message });
      }
      const { language, code, systemCode, testCase } = parsed.data;
      const trace = traceCase(language, code, testCase, systemCode);
      return json(res, 200, trace);
    } catch (e) {
      if (e instanceof BadRequestError) {
        return json(res, e.status, { error: e.message, kind: 'request' });
      }
      // Internal failure (compiler/debugger missing, stepper crash) — distinct
      // from a bad submission, which traceCase already returns as an error verdict.
      return json(res, 500, { error: e instanceof Error ? e.message : String(e), kind: 'service' });
    }
  });
}
