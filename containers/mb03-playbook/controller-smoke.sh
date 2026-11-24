#!/bin/sh
set -eu
cd /app
test -f pbos/tools/mb03-protected-playbook-codex.ts
test -f pbos/production-runtime/hosted-playbook-codex-composition.ts
test -f pbos/production-runtime/hosted-remote-worker-mission.ts
test -x node_modules/.bin/tsx
test ! -e /var/lib/pbos
test ! -e /var/run/pbos-operator
test ! -e /var/run/pbos-provider
test ! -e /var/run/pbos-missions
test ! -e /var/run/secrets
test "$(id -u)" != "0"
output="$(mktemp)"
set +e
./node_modules/.bin/tsx pbos/tools/mb03-protected-playbook-codex.ts >"${output}.out" 2>"$output"
status="$?"
set -e
test "$status" -eq 2
test ! -s "${output}.out"
grep -q '"gate":"MB03_PROTECTED_PLAYBOOK_CODEX_EXECUTION"' "$output"
grep -q '"status":"BLOCKED"' "$output"
rm -f "$output" "${output}.out"
echo "PASS: dedicated image contains approved controller; non-root; zero secrets/state; refuses execution without protected authorization"
