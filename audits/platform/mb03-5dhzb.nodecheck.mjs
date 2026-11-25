import test from "node:test";
import assert from "node:assert/strict";
import {inspect} from "./mb03-5dhzb-forensic.mjs";
const sha="a".repeat(64);
function container(){
 const env=Object.entries({
 PBOS_APPROVAL_PUBLIC_KEY_FILE:"/var/lib/pbos-private/operator-public.pem",
 PBOS_PROVIDER_PUBLIC_KEY_FILE:"/var/lib/pbos-private/provider-public.pem",
 PBOS_PROVIDER_SIGNING_KEY_FILE:"/var/lib/pbos-private/provider-private.pem",
 PBOS_OBSERVATION_KEY_FILE:"/var/lib/pbos-private/observation-key",
 PBOS_MISSION_EXECUTION_APPROVED:"true",PBOS_MISSION_INPUT_FILE:"/var/lib/pbos-missions/mission.json"
 }).map(([name,value])=>({name,value}));
 const volumeMounts=Object.entries({
 "operator-public-key":"/var/run/secrets/mb03/operator","provider-public-key":"/var/run/secrets/mb03/provider-public",
 "provider-signing-key":"/var/run/secrets/mb03/provider","observation-key":"/var/run/secrets/mb03/observation"
 }).map(([name,mountPath])=>({name,mountPath}));
 return {image:"us-west1-docker.pkg.dev/pbos-genesis-staging/pbos-executor/controller@sha256:"+sha,
 command:["/usr/local/bin/mb03-stage-secrets"],
 args:["./node_modules/.bin/tsx","pbos/tools/mb03-protected-playbook-codex.ts"],env,volumeMounts};
}
const job=()=>({metadata:{name:"pbos-mb03-playbook-codex",generation:23},status:{observedGeneration:23},
 spec:{template:{spec:{template:{spec:{containers:[container()]}}}}}});
const exec=()=>({metadata:{name:"pbos-mb03-playbook-codex-5dhzb"},
 job:"projects/pbos-genesis-staging/locations/us-west1/jobs/pbos-mb03-playbook-codex",
 spec:{template:{spec:{containers:[container()]}}}});
test("matching manifest remains non-authorizing for runtime file modes",()=>{
 const r=inspect(job(),exec());assert.equal(r.findings.length,0);assert.equal(r.actualPrivateFileMode0400Verified,false);
 assert.equal(r.missionAuthorized,false);
});
test("old direct Secret Manager path and missing wrapper are blocked",()=>{
 const x=exec(),c=x.spec.template.spec.containers[0];c.command=["./node_modules/.bin/tsx"];
 c.env.find(e=>e.name==="PBOS_APPROVAL_PUBLIC_KEY_FILE").value="/var/run/secrets/mb03/operator/public.pem";
 const r=inspect(job(),x);assert.ok(r.findings.includes("FAILED_EXECUTION_STAGING_WRAPPER_MISSING"));
 assert.ok(r.findings.includes("FAILED_EXECUTION_PBOS_APPROVAL_PUBLIC_KEY_FILE_UNSTAGED"));
});
test("old image and duplicate private env signer are detected without leakage",()=>{
 const x=exec(),c=x.spec.template.spec.containers[0];
 c.image=c.image.replace(sha,"b".repeat(64));c.env.push({name:"PBOS_PROVIDER_SIGNING_KEY_PEM",value:"SENSITIVE_MATERIAL"});
 const r=inspect(job(),x);assert.ok(r.findings.includes("HISTORICAL_IMAGE_DIFFERS_FROM_CURRENT_JOB"));
 assert.ok(r.findings.includes("FAILED_EXECUTION_DUPLICATE_PRIVATE_SIGNER_ENV"));
 assert.ok(!JSON.stringify(r).includes("SENSITIVE_MATERIAL"));
});
test("missing observed generation and wrong parent fail closed",()=>{
 const j=job();delete j.status.observedGeneration;
 const x=exec();x.job="projects/example/locations/us-west1/jobs/another";
 const f=inspect(j,x).findings;
 assert.ok(f.includes("GENERATION_EVIDENCE_MISSING"));
 assert.ok(f.includes("EXECUTION_PARENT_WRONG"));
});
test("v2 execution shape and invalid image refs are recognized separately",()=>{
 const x={name:"projects/x/locations/us-west1/jobs/pbos-mb03-playbook-codex/executions/pbos-mb03-playbook-codex-5dhzb",
 job:"projects/x/locations/us-west1/jobs/pbos-mb03-playbook-codex",template:{containers:[container()]}};
 assert.equal(inspect(job(),x).findings.length,0);
 x.template.containers[0].image="controller:latest";
 assert.ok(inspect(job(),x).findings.includes("FAILED_EXECUTION_IMAGE_NOT_DIGEST_PINNED"));
});
test("malformed execution cannot report a success",()=>{
 const x=exec();x.spec.template.spec.containers=[];
 assert.ok(inspect(job(),x).findings.includes("FAILED_EXECUTION_SPEC_UNREADABLE"));
});
