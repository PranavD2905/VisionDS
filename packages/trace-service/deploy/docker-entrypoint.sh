#!/bin/sh
# Install the no-network rule for the sandbox uid, then start the service.
# Fails closed: if the rule cannot be installed, the service does not start —
# student code must never run with network access.
set -eu

if [ -n "${VISIONDS_SANDBOX_USER:-}" ]; then
  uid=$(id -u "$VISIONDS_SANDBOX_USER")
  port=${PORT:-8080}

  apply() { # $1 = iptables | ip6tables
    t=$1
    # The service's own port: student code must not call back into /trace.
    "$t" -A OUTPUT -o lo -p tcp --dport "$port" -m owner --uid-owner "$uid" -j REJECT
    # Other loopback stays open — JDI attaches to its target JVM on localhost.
    "$t" -A OUTPUT -o lo -m owner --uid-owner "$uid" -j ACCEPT
    "$t" -A OUTPUT -m owner --uid-owner "$uid" -j REJECT
  }

  # nft-backed iptables first, legacy as a fallback for kernels without nf_tables.
  if apply iptables 2>/dev/null; then
    apply ip6tables 2>/dev/null || echo "[visionds] warning: ip6tables unavailable; IPv4 egress blocked" >&2
  elif apply iptables-legacy; then
    apply ip6tables-legacy 2>/dev/null || echo "[visionds] warning: ip6tables-legacy unavailable; IPv4 egress blocked" >&2
  else
    echo "[visionds] FATAL: could not install the sandbox egress rule (needs NET_ADMIN)" >&2
    exit 1
  fi
  echo "[visionds] sandbox: uid $uid has no network (loopback only, port $port blocked)"
fi

exec "$@"
