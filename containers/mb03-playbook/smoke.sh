#!/bin/sh
set -eu

# Offline-only audit of the exact, separately scoped Playbook worker image.
test "$(uname -m)" = x86_64
for executable in git python3 runuser useradd sha256sum; do command -v "$executable" >/dev/null; done
test "$(stat -c '%u:%g:%a' /usr/local/bin/codex)" = 0:0:755
printf '%s  %s\n' \
  b76a027d6b210f9a8da7aaf321dd235c700f0ef7a794d4a5314b9af6c134f0f0 /usr/local/bin/codex | sha256sum -c -

source=/opt/pbos-source
sha=b2c2259d67f30ca068f32cd1889542991f294e42
test "$(git -C "$source" rev-parse HEAD)" = "$sha"
test "$(git -C "$source" rev-parse --abbrev-ref HEAD)" = HEAD
test "$(git -C "$source" remote get-url origin)" = https://github.com/sgwalton87/playbook-platform.git
test -z "$(git -C "$source" status --porcelain)"

for mission in MB03-MISSION-001 MB03-MISSION-002; do
  path="docs/pbos-missions/$mission.md"
  file="$source/$path"
  test -f "$file"
  test ! -L "$file"
  test "$(git -C "$source" ls-files --stage -- "$path" | cut -d' ' -f1)" = 100644
  grep -q "NOT EXECUTED, NOT ACCEPTED" "$file"
done

test ! -e /var/lib/pbos
test ! -e /var/run/pbos-operator
printf '%s\n' 'PASS: exact Playbook source, both inert mission targets, Codex digest, no mounted Genesis or credentials.'
printf '%s\n' 'NON-AUTHORIZING: no model call, sandbox launch, mission execution, image publication, PR creation or deployment.'
