#!/bin/sh
# Offline synthetic secrets only; no Cloud Run or mission execution.
set -eu
umask 077
# Exercise the real readiness command with no mounts or identity. It must reach
# its own binding check without creating the private secret staging directory.
code=0
/usr/local/bin/mb03-stage-secrets ./node_modules/.bin/tsx pbos/tools/mb03-protected-playbook-codex.ts \
    --verify-mission-001-journal-read 2>/tmp/mb03-journal-read.err || code=$?
test "$code" -eq 2
grep -q RECOVERY_JOURNAL_BINDING /tmp/mb03-journal-read.err
test ! -e /var/lib/pbos-private
for directory in operator provider-public provider observation; do
    mkdir -p "/run/secrets/mb03/$directory"
done
printf 'synthetic-operator\n' > /run/secrets/mb03/operator/public.pem
printf 'synthetic-provider-public\n' > /run/secrets/mb03/provider-public/public.pem
printf 'synthetic-provider-private\n' > /run/secrets/mb03/provider/private.pem
printf 'synthetic-observation\n' > /run/secrets/mb03/observation/key
chmod 0444 /run/secrets/mb03/operator/public.pem \
    /run/secrets/mb03/provider-public/public.pem \
    /run/secrets/mb03/provider/private.pem \
    /run/secrets/mb03/observation/key

/usr/local/bin/mb03-stage-secrets /bin/sh -c '
    set -eu
    test "$(id -u)" -eq 1000
    test "$(id -g)" -eq 1000
    test "$(stat -c %a /var/lib/pbos-private)" = 700
    for name in operator-public.pem provider-public.pem provider-private.pem observation-key; do
        path="/var/lib/pbos-private/$name"
        test -s "$path"
        test -r "$path"
        test "$(stat -c %u "$path")" = 1000
        test "$(stat -c %g "$path")" = 1000
        test "$(stat -c %a "$path")" = 400
    done
'
# A pre-existing target must never be overwritten, including on repeated invocation.
if /usr/local/bin/mb03-stage-secrets /bin/true >/dev/null 2>&1; then
    echo "FAIL: existing staging directory accepted" >&2
    exit 1
fi
rm -rf /var/lib/pbos-private

# No symlink leaf can be used as a credential source.
mv /run/secrets/mb03/operator/public.pem /run/secrets/mb03/operator/original.pem
ln -s original.pem /run/secrets/mb03/operator/public.pem
if /usr/local/bin/mb03-stage-secrets /bin/true >/dev/null 2>&1; then
    echo "FAIL: symlink leaf accepted" >&2
    exit 1
fi
rm /run/secrets/mb03/operator/public.pem
mv /run/secrets/mb03/operator/original.pem /run/secrets/mb03/operator/public.pem
rm -rf /var/lib/pbos-private

# No substituted ancestor below the managed /var/run -> /run alias.
mv /run/secrets/mb03/operator /run/secrets/mb03/operator-original
ln -s operator-original /run/secrets/mb03/operator
if /usr/local/bin/mb03-stage-secrets /bin/true >/dev/null 2>&1; then
    echo "FAIL: nested directory redirect accepted" >&2
    exit 1
fi
# In exact verify-only mode, a mission signing key must not be mounted or staged.
rm /run/secrets/mb03/operator
mv /run/secrets/mb03/operator-original /run/secrets/mb03/operator
rm -rf /var/lib/pbos-private
rm /run/secrets/mb03/provider/private.pem
set +e
/usr/local/bin/mb03-stage-secrets ./node_modules/.bin/tsx pbos/tools/mb03-protected-playbook-codex.ts --verify-bindings >/tmp/mb03-verify.out 2>/tmp/mb03-verify.err
status="$?"
set -e
# The actual controller fails closed because this synthetic CI environment has no Cloud Run bindings.
if [ "$status" -ne 2 ]; then
    echo "FAIL: synthetic verify-only controller exit status $status" >&2
    sed -n '1,12p' /tmp/mb03-verify.err >&2
    exit 1
fi
test ! -e /var/lib/pbos-private/provider-private.pem
for name in operator-public.pem provider-public.pem observation-key; do
    path="/var/lib/pbos-private/$name"
    test -s "$path"
    test "$(stat -c %a "$path")" = 400
    test "$(stat -c %u "$path")" = 1000
done
echo "PASS: root-owned 0444 synthetic mounts become node-owned 0400 files; unsafe sources fail closed"
