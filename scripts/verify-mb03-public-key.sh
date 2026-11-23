#!/usr/bin/env bash
# MB-03 public-key verification only. Does not access private key or activate signer.
set -euo pipefail
PEM="${1:-mb03-staging-public.pem}"
DER="${2:-mb03-staging-public.der.bin}"
EXPECTED="db04246cbc743ba2c75652de473ea3aba8e558f954826dd6e30d8bd0425bcff0"
for f in "$PEM" "$DER"; do [[ -f "$f" ]] || { echo "MISSING: $f"; exit 2; }; done
openssl pkey -pubin -in "$PEM" -text -noout | grep -qi 'ED25519 Public-Key' || { echo 'FAIL: not Ed25519'; exit 3; }
cmp <(openssl pkey -pubin -in "$PEM" -outform DER) "$DER" || { echo 'FAIL: PEM and DER differ'; exit 4; }
ACTUAL="$(shasum -a 256 "$DER" | awk '{print $1}')"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "FAIL: fingerprint $ACTUAL"; exit 5; }
echo "PASS: Ed25519 public PEM/DER match; SHA-256 SPKI fingerprint $ACTUAL"
echo "NOTE: Does NOT verify private-key custody, independent reviewer identity, hosted binding, or mission authorization."
