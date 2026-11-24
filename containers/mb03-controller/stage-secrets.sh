#!/bin/sh
# Root-only secret handoff; mission process runs exclusively as node.
set -eu
umask 077
if [ "$(id -u)" -ne 0 ]; then
  echo 'MB03_SECRET_STAGE:wrong-uid' >&2
  exit 2
fi
root=/var/lib/pbos-private
# Refuse pre-existing staging targets; never overwrite or traverse a planted link.
if [ -e "$root" ] || [ -L "$root" ]; then
  echo 'MB03_SECRET_STAGE:existing-target' >&2
  exit 2
fi
install -d -o node -g node -m 0700 "$root"
stage() {
  src="$1"
  dest="$2"
  # Never follow substituted symbolic-link leafs.
  if [ ! -f "$src" ] || [ -L "$src" ] || [ ! -s "$src" ]; then
    echo 'MB03_SECRET_STAGE:missing-or-invalid' >&2
    exit 2
  fi
  # Restrict to exactly the platform-managed /var/run -> /run alias.\n  case "$src" in /var/run/secrets/mb03/*) ;; *) echo 'MB03_SECRET_STAGE:invalid-source' >&2; exit 2 ;; esac\n  canonical="$(readlink -f "$src")"\n  expected="/run/${src#/var/run/}"\n  if [ "$canonical" != "$expected" ]; then\n    echo 'MB03_SECRET_STAGE:redirected' >&2\n    exit 2\n  fi\n  install -o node -g node -m 0400 "$src" "$root/$dest"
}
stage /var/run/secrets/mb03/operator/public.pem operator-public.pem
stage /var/run/secrets/mb03/provider-public/public.pem provider-public.pem
stage /var/run/secrets/mb03/provider/private.pem provider-private.pem
stage /var/run/secrets/mb03/observation/key observation-key
# The supplied command is fixed in the reviewed Cloud Run manifest.
exec gosu node "$@"
