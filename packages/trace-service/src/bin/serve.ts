import { createTraceServer } from '../server';

const PORT = Number(process.env.PORT ?? 8787);

createTraceServer().listen(PORT, () => {
  console.log(`[visionds] trace service listening on http://localhost:${PORT}`);
  console.log(`[visionds]   POST /trace  {language, code, testCase} -> ExecutionTrace`);
  console.log(`[visionds]   GET  /health`);
});
