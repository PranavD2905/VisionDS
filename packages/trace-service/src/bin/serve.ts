import { createTraceServer } from '../server';

const PORT = Number(process.env.PORT ?? 8787);

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
