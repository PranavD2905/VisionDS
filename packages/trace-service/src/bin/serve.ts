import { ensureTracerCompiled } from '../adapters/java';
import { createTraceServer } from '../server';

const PORT = Number(process.env.PORT ?? 8787);

// Compile the JDI tracer before the first request: the first Java run no
// longer pays for it, and in the container it lands in the root-owned cache
// before any student code could touch the path. No JDK just means no Java.
try {
  ensureTracerCompiled();
} catch (e) {
  console.warn(`[visionds] Java tracing unavailable: ${e instanceof Error ? e.message : String(e)}`);
}

const server = createTraceServer();

// `pnpm dev` starts this beside the web app; a second copy (or one left over
// from another checkout) should say so plainly, not dump a stack trace.
server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(
      `[visionds] port ${PORT} is already in use — a trace service is probably running already ` +
        `(check \`lsof -i :${PORT}\`). Stop it, or start this one with PORT=<port> and point the ` +
        'web app at it with VITE_TRACE_SERVICE.',
    );
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => {
  console.log(`[visionds] trace service listening on http://localhost:${PORT}`);
  console.log(`[visionds]   POST /trace  {language, code, systemCode?, testCase} -> ExecutionTrace`);
  console.log(`[visionds]   GET  /health`);
});

// Fly (and any orchestrator) sends SIGTERM before replacing a machine: stop
// accepting, let in-flight traces finish, then exit — bounded so a stuck
// trace can't hold the deploy.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => {
    console.log(`[visionds] ${sig} — draining`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 25_000).unref();
  });
}
