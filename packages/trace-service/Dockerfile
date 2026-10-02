# VisionDS trace service — C++ (clang + lldb) and Java (JDK + JDI) tracing.
#
# Build from the REPO ROOT (the service imports workspace packages):
#   docker build -f packages/trace-service/Dockerfile -t visionds-trace .
# Run locally (iptables needs NET_ADMIN, lldb needs ptrace, the per-run PID
# namespace needs SYS_ADMIN + mount, which AppArmor's docker profile denies):
#   docker run --rm -p 8787:8080 --cap-add NET_ADMIN --cap-add SYS_PTRACE \
#     --cap-add SYS_ADMIN --security-opt seccomp=unconfined \
#     --security-opt apparmor=unconfined visionds-trace
#
# On Fly.io the machine is a Firecracker VM, so root inside it already has
# all of these; no flags needed.

FROM node:22-bookworm-slim

ARG LLVM_VERSION=16
ARG JDK_VERSION=17

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      clang-${LLVM_VERSION} lldb-${LLVM_VERSION} python3-lldb-${LLVM_VERSION} python3 \
      openjdk-${JDK_VERSION}-jdk-headless \
      iptables util-linux ca-certificates \
 && ln -sf /usr/bin/clang++-${LLVM_VERSION} /usr/local/bin/clang++ \
 && ln -sf /usr/bin/lldb-${LLVM_VERSION} /usr/local/bin/lldb \
 && rm -rf /var/lib/apt/lists/*

# The real lldb package (with __init__.py) is under the versioned site-packages;
# python3/dist-packages only holds .so shims and imports as an empty namespace.
# python3.11 = bookworm's python3 — change it with the base image.
# LLDB_DEBUGSERVER_PATH: Debian names it lldb-server; lldb looks for
# lldb-server-<full version> and fails to launch without this.
ENV VISIONDS_LLDB_PYTHONPATH=/usr/lib/llvm-${LLVM_VERSION}/lib/python3.11/site-packages \
    LLDB_DEBUGSERVER_PATH=/usr/lib/llvm-${LLVM_VERSION}/bin/lldb-server \
    VISIONDS_PYTHON=/usr/bin/python3 \
    VISIONDS_JAVA_HOME=/usr/lib/jvm/java-${JDK_VERSION}-openjdk-amd64 \
    VISIONDS_CACHE_DIR=/var/cache/visionds \
    VISIONDS_SANDBOX_USER=sandbox \
    NODE_ENV=production \
    PORT=8080

# Debian's _lldb extension is a symlink to liblldb.so, which only the -dev
# package installs, so it dangles. Point it at the runtime library instead.
RUN set -eux; \
    lib=/usr/lib/llvm-${LLVM_VERSION}/lib; \
    ext=$(ls "$VISIONDS_LLDB_PYTHONPATH"/lldb/_lldb.cpython-*.so); \
    real=$(ls "$lib"/liblldb.so.* | head -n1); \
    ls -l "$ext" "$lib"/liblldb*; \
    ln -sf "$real" "$ext"

# Fail the build, not the first request, if the debugger toolchain is broken.
RUN PYTHONPATH="$VISIONDS_LLDB_PYTHONPATH" python3 -c "import lldb; lldb.SBDebugger.Create()" \
 && "$VISIONDS_JAVA_HOME/bin/javac" -version \
 && clang++ --version

# The only account student code ever runs as. No home, no shell, no groups.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin sandbox \
 && mkdir -p "$VISIONDS_CACHE_DIR" && chmod 755 "$VISIONDS_CACHE_DIR"

RUN corepack enable
WORKDIR /app
COPY . .
# Only the service and its workspace deps (trace-schema, entry-policy). Dev
# deps stay: tsx runs the service and vitest runs the sandbox tests in CI.
RUN pnpm install --frozen-lockfile --filter "@visionds/trace-service..."

# The server itself stays root inside the VM: it is what drops each student
# run to `sandbox` (setpriv needs CAP_SETUID). The VM is the outer boundary.
WORKDIR /app/packages/trace-service
EXPOSE 8080
ENTRYPOINT ["/app/packages/trace-service/deploy/docker-entrypoint.sh"]
# tsx directly, not via pnpm, so SIGTERM reaches the drain handler.
CMD ["node_modules/.bin/tsx", "src/bin/serve.ts"]
