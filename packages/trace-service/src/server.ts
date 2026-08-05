import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { TestCaseSchema } from '@visionds/trace-schema';
import { z } from 'zod';
import { supportedLanguages, traceCase } from './trace';

const RequestSchema = z.object({
  language: z.string(),
  code: z.string(),
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

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new Error('request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The trace service. One endpoint, `POST /trace`, mirrors the client-side
 * runner contract: given {language, code, testCase} it returns an
 * ExecutionTrace. Runs compilers and a debugger locally.
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
      const parsed = RequestSchema.safeParse(JSON.parse(await readBody(req)));
      if (!parsed.success) {
        return json(res, 400, { error: 'invalid request', detail: parsed.error.message });
      }
      const { language, code, testCase } = parsed.data;
      const trace = traceCase(language, code, testCase);
      return json(res, 200, trace);
    } catch (e) {
      // Internal failure (compiler/debugger missing, stepper crash) — distinct
      // from a bad submission, which traceCase already returns as an error verdict.
      return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}
