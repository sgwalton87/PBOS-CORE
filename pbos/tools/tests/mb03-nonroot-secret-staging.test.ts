import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("MB-03 non-root secret handoff review contract", () => {
  const docker = readFileSync(resolve("Dockerfile.mb03-playbook-controller"), "utf8");
  const wrapper = readFileSync(resolve("containers/mb03-controller/stage-secrets.sh"), "utf8");
  const job = readFileSync(resolve("infra/mb03/job.secret-staging-preflight.template.yaml"), "utf8");

  it("drops privileges before any controller code", () => {
    expect(docker).toContain('ENTRYPOINT ["/usr/local/bin/mb03-stage-secrets"]');
    expect(wrapper).toContain('exec gosu node "$@"');
    expect(wrapper).toContain('umask 077');
    expect(wrapper).toContain('install -d -o node -g node -m 0700');
    expect(wrapper).toContain('install -o node -g node -m 0400');
  });
  it("rejects non-root staging and untrusted redirected paths", () => {
    expect(wrapper).toContain('if [ "$(id -u)" -ne 0 ]');
    expect(wrapper).toContain('canonical="$(readlink -f "$src")"');
    expect(wrapper).toContain('if [ "$canonical" != "$expected" ]');
    expect(wrapper).not.toContain("cat \"$src\"");
  });
  it("uses a distinct non-executable, unsigned preflight template", () => {
    expect(job).toContain("image: REPLACE_WITH_APPROVED_CONTROLLER_IMAGE_DIGEST");
    expect(job).toContain("- /usr/local/bin/mb03-stage-secrets");
    expect(job).toContain("- --verify-bindings");
    expect(job).toContain('value: "false"');
    expect(job).not.toContain('value: "true"');
    for (const name of ["PBOS_APPROVAL_PUBLIC_KEY_FILE", "PBOS_PROVIDER_PUBLIC_KEY_FILE", "PBOS_PROVIDER_SIGNING_KEY_FILE", "PBOS_OBSERVATION_KEY_FILE"]) {
      expect(job).toContain("name: " + name);
    }
    expect(job).toContain("/var/lib/pbos-private/operator-public.pem");
    expect(job).toContain("/var/lib/pbos-private/provider-public.pem");
    expect(job).toContain("/var/lib/pbos-private/provider-private.pem");
    expect(job).toContain("/var/lib/pbos-private/observation-key");
  });
});
