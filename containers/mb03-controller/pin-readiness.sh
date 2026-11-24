#!/bin/sh
# Render immutable signature-free Cloud Run readiness YAML. Never deploys.
set -eu
if [ "$#" -ne 2 ]; then
  echo 'MB03_PIN:expected-image-and-output' >&2
  exit 2
fi
image="$1"
output="$2"
prefix='us-west1-docker.pkg.dev/pbos-genesis-staging/pbos-executor/mb03-playbook-controller@sha256:'
case "$image" in
  "$prefix"*) ;;
  *) echo 'MB03_PIN:unreviewed-image-origin' >&2; exit 2 ;;
esac
digest="$(printf '%s' "$image" | sed "s#^$prefix##")"
if [ "$(printf '%s' "$digest" | wc -c)" -ne 64 ] ||
   ! printf '%s' "$digest" | grep -Eq '^[a-f0-9]{64}$'; then
  echo 'MB03_PIN:invalid-digest' >&2
  exit 2
fi
if [ -e "$output" ] || [ -L "$output" ]; then
  echo 'MB03_PIN:existing-output' >&2
  exit 2
fi
template='job.mb03-readiness.yaml'
placeholder='REPLACE_WITH_APPROVED_CONTROLLER_IMAGE_DIGEST'
if [ "$(grep -cF "$placeholder" "$template")" -ne 1 ] ||
   ! grep -Fq -- '- --verify-bindings' "$template" ||
   ! grep -Fq -- 'value: "false"' "$template" ||
   grep -Fq -- 'value: "true"' "$template"; then
  echo 'MB03_PIN:unsafe-template' >&2
  exit 2
fi
sed "s#$placeholder#$image#" "$template" > "$output"
if grep -Fq "$placeholder" "$output"; then
  rm -f "$output"
  echo 'MB03_PIN:render-failed' >&2
  exit 2
fi
echo 'MB03_PIN:READY_FOR_SEPARATE_READ_ONLY_REVIEW'
