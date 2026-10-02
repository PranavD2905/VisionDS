import { describe, expect, it } from 'vitest';
import { sandboxEnabled } from './sandbox';
import { traceCase } from './trace';

// Student code that tries to escape. These only mean anything inside the
// container image, where VISIONDS_SANDBOX_USER is set and the entrypoint has
// installed the no-network rule — so they run there (CI + pre-deploy) and are
// skipped in local macOS dev.
describe.skipIf(!sandboxEnabled())('sandbox (container only)', () => {
  const tc = (expected: string) => ({ input: '0', expected });

  it('cannot open an outbound connection', async () => {
    const code = `#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
class Solution { public:
  int probe(int x) {
    int s = socket(AF_INET, SOCK_STREAM, 0);
    if (s < 0) return 0;
    sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(80);
    inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
    int r = connect(s, (sockaddr*)&a, sizeof a);
    close(s);
    return r == 0 ? 1 : 0;
  }
};`;
    const trace = await traceCase('cpp', code, tc('0'));
    expect(trace.result.verdict).toBe('pass');
  });

  it('does not see the server environment', async () => {
    process.env.VISIONDS_TEST_SECRET = 'hunter2';
    const code = `#include <cstdlib>
class Solution { public:
  int probe(int x) { return getenv("VISIONDS_TEST_SECRET") ? 1 : 0; }
};`;
    const trace = await traceCase('cpp', code, tc('0'));
    expect(trace.result.verdict).toBe('pass');
  });

  it('cannot read root-only files', async () => {
    const code = `#include <cstdio>
class Solution { public:
  int probe(int x) { FILE* f = fopen("/etc/shadow", "r"); if (f) { fclose(f); return 1; } return 0; }
};`;
    const trace = await traceCase('cpp', code, tc('0'));
    expect(trace.result.verdict).toBe('pass');
  });

  it('survives a fork bomb and keeps serving', async () => {
    const code = `#include <unistd.h>
class Solution { public:
  int probe(int x) { while (true) fork(); return 0; }
};`;
    const bomb = await traceCase('cpp', code, tc('0')).catch((e: Error) => e);
    // Killed by rlimits/watchdog: any outcome but a pass, and no hang.
    if (!(bomb instanceof Error)) expect(bomb.result.verdict).not.toBe('pass');

    const ok = await traceCase('cpp', 'class Solution { public: int probe(int x) { return x + 1; } };', tc('1'));
    expect(ok.result.verdict).toBe('pass');
  }, 60_000);

  it('cannot allocate past the memory cap', async () => {
    const code = `#include <cstdlib>
#include <cstring>
class Solution { public:
  int probe(int x) {
    char* p = (char*)malloc(8UL << 30);
    if (!p) return 0;
    memset(p, 1, 8UL << 30);
    return 1;
  }
};`;
    // malloc refused (→ 0, a pass), or the run killed — never a completed 8 GB write.
    const trace = await traceCase('cpp', code, tc('0')).catch((e: Error) => e);
    if (!(trace instanceof Error)) expect(trace.result.verdict).not.toBe('fail');
  }, 60_000);
});
