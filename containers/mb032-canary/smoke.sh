#!/bin/sh
set -eu

test "$(uname -m)" = x86_64
for executable in bash bwrap curl git python3 runuser useradd; do
    command -v "$executable" >/dev/null
done
test "$(stat -c '%u:%g:%a' /usr/local/bin/codex)" = 0:0:755
printf '%s  %s\n' b76a027d6b210f9a8da7aaf321dd235c700f0ef7a794d4a5314b9af6c134f0f0 /usr/local/bin/codex | sha256sum -c -

source_checkout=/tmp/pbos-fixture-source
root=/var/lib/pbos-canary
worktree="$root/worktree"
home="$root/home"
codex_home="$home/codex"
scratch="$root/scratch"
user=pboscanary
relative=pbos/master-builder/tests/fixtures/remote-canary.txt
origin=https://github.com/sgwalton87/PBOS-CORE
before='PBOS-REMOTE-CANARY: pending
'
after='PBOS-REMOTE-CANARY: completed
'

clone_revision_fixture() {
    fixture_root="$(mktemp -d)"
    fixture_repo="$fixture_root/origin"
    git init --quiet "$fixture_repo"
    mkdir -p "$fixture_repo/$(dirname "$relative")"
    printf '%s' "$before" >"$fixture_repo/$relative"
    printf 'outside\n' >"$fixture_repo/outside.txt"
    git -C "$fixture_repo" add .
    git -C "$fixture_repo" -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm 'Isolated image fixture'
    pinned="$(git -C "$fixture_repo" rev-parse HEAD)"
    printf 'different tip\n' >"$fixture_repo/$relative"
    git -C "$fixture_repo" -c user.name=Fixture -c user.email=fixture@example.invalid commit -qam 'Advance the fixture branch'

    git clone --quiet --depth 1 --revision "$pinned" "file://$fixture_repo" "$source_checkout"
    test "$(git -C "$source_checkout" rev-parse HEAD)" = "$pinned"
    test "$(git -C "$source_checkout" rev-parse --abbrev-ref HEAD)" = HEAD
    printf '%s' "$before" | cmp - "$source_checkout/$relative"

    if git clone --quiet --depth 1 --revision 1111111111111111111111111111111111111111 \
        "file://$fixture_repo" "$fixture_root/invalid" 2>"$fixture_root/invalid.log"; then
        printf 'Clone accepted an invalid revision\n' >&2
        return 1
    fi
    git -C "$source_checkout" remote set-url origin "$origin.git"
    sha="$pinned"
}

clone_revision_fixture
printf 'Exact-SHA clone, detached HEAD, fixture content and invalid revision checks passed.\n'
python3 -I /checks/bootstrap.py "$source_checkout" "$root" "$worktree" "$home" "$codex_home" "$scratch" "$user" \
    "$relative" "$origin" "$sha" /usr/local/bin/codex b76a027d6b210f9a8da7aaf321dd235c700f0ef7a794d4a5314b9af6c134f0f0 "$before"

runuser -u "$user" -- /usr/bin/test ! -w "$worktree/outside.txt"
runuser -u "$user" -- /usr/bin/test ! -w "$worktree/.git"
runuser -u "$user" -- /usr/bin/test ! -w "$(dirname "$worktree/$relative")"
runuser -u "$user" -- /bin/sh -c 'printf "%s" "$1" >"$2"' sh "$after" "$worktree/$relative"
python3 -I /checks/collect.py "$worktree" "$relative" "$sha" "$after" >/dev/null

# Confirm the collector fails closed if the isolated fixture drifts.
printf 'unexpected second change\n' >"$worktree/outside.txt"
if python3 -I /checks/collect.py "$worktree" "$relative" "$sha" "$after"; then
    printf 'Collector accepted an out-of-scope edit\n' >&2
    exit 1
fi
printf 'Canary checkout and file-boundary smoke checks passed.\n'
