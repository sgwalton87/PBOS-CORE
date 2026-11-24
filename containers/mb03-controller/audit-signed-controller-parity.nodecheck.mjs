import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { audit, READINESS, SIGNED, SERVICE_ACCOUNT, APPROVED_IMAGE, APPROVED_SOURCE, ENTRYPOINT, EXECUTABLE, CONTROLLER } from "./audit-signed-controller-parity.mjs";

const makeEnv = (name, value) => ({ name, value });
const secretEnv = (name, secretName) => ({name,valueFrom:{secretKeyRef:{name:secretName,key:"1"}}});
const privateVolume = (name,secretName,path) => ({ name, secret: {secretName,items:[{key:"1",path}]} });
const gcs = (name,readOnly) => ({name,csi:{driver:"gcsfuse.run.googleapis.com",readOnly}});
const mounts = [
 {name:"execution-state",mountPath:"/var/lib/pbos-missions"},
 {name:"observation-state",mountPath:"/var/lib/pbos-observation"},
 {name:"pps-canon",mountPath:"/var/run/pbos-canon"},
 {name:"operator-public-key",mountPath:"/var/run/secrets/mb03/operator"},
 {name:"provider-public-key",mountPath:"/var/run/secrets/mb03/provider-public"},
 {name:"observation-key",mountPath:"/var/run/secrets/mb03/observation"}
];
const keys = [
 privateVolume("operator-public-key","mb03-operator-public-key","public.pem"),
 privateVolume("provider-public-key","mb03-provider-public-key","public.pem"),
 privateVolume("observation-key","mb03-observation-seal-key","key")
];
function job(isSigned) {
 const name=isSigned?SIGNED:READINESS;
 const env=[
  makeEnv("PBOS_MISSION_EXECUTION_APPROVED",String(isSigned)),
  makeEnv("PBOS_PLAYBOOK_SOURCE_SHA",APPROVED_SOURCE),
  makeEnv("PBOS_OBSERVATION_KEY_FILE","/var/lib/pbos-private/observation-key"),
  makeEnv("PBOS_APPROVAL_PUBLIC_KEY_FILE","/var/lib/pbos-private/operator-public.pem"),
  makeEnv("PBOS_PROVIDER_PUBLIC_KEY_FILE","/var/lib/pbos-private/provider-public.pem"),
  makeEnv("PBOS_APPROVAL_PUBLIC_KEY_SHA256","db04246cbc743ba2c75652de473ea3aba8e558f954826dd6e30d8bd0425bcff0"),
  makeEnv("PBOS_PROVIDER_PUBLIC_KEY_SHA256","e4a807a070776cc37dae41c597a24d88a19c5a5d77feae187d57fec37e83345d"),
  makeEnv("PBOS_DISPOSABLE_AUTHORITY_ID","84464dfd-2ada-4292-a15b-99d3fa5f28e2"),
  makeEnv("PBOS_STATE_NAMESPACE","mb03-stage4-synthetic-20261124"),
  makeEnv("PBOS_EXPECTED_RUNTIME_SERVICE_ACCOUNT",SERVICE_ACCOUNT)
 ];
 const allMounts=[...mounts],volumes=[gcs("execution-state",!isSigned),gcs("observation-state",true),gcs("pps-canon",true),...keys];
 if(isSigned) {
  env.push(makeEnv("PBOS_PROVIDER_SIGNING_KEY_FILE","/var/lib/pbos-private/provider-private.pem"));
  env.push(makeEnv("PBOS_MISSION_INPUT_FILE","/var/lib/pbos-missions/mission.json"));
  env.push(secretEnv("PBOS_VERCEL_SANDBOX_TOKEN","mb03-vercel-sandbox-token"));
  env.push(secretEnv("PBOS_MODEL_ADMIN_CREDENTIAL","mb03-model-broker-admin-credential"));
  env.push(secretEnv("PBOS_CHECKPOINT_KEY_BASE64","mb03-checkpoint-key"));
  allMounts.push({name:"provider-signing-key",mountPath:"/var/run/secrets/mb03/provider"});
  volumes.push(privateVolume("provider-signing-key","mb03-provider-signing-key","private.pem"));
 }
 return {metadata:{name},spec:{template:{spec:{template:{spec:{
  containers:[{image:APPROVED_IMAGE,command:[ENTRYPOINT],args:isSigned?[EXECUTABLE,CONTROLLER]:[EXECUTABLE,CONTROLLER,"--verify-bindings"],env,volumeMounts:allMounts}],
  maxRetries:0,serviceAccountName:SERVICE_ACCOUNT,volumes
 }}}}}};
}
test("matched signed and verified-readiness job specs attest parity without execution",()=>{
 const r=audit(job(false),job(true));
 assert.equal(r.status,"PARITY_VERIFIED");
 assert.deepEqual(r.findings,[]);
 assert.equal(r.missionExecuted,false);
 assert.equal(r.signedApprovalVerified,false);
});
test("historical signed image, direct Node startup and source SHA drift are blocked",()=>{
 const old=job(true);
 const c=old.spec.template.spec.template.spec.containers[0];
 c.image="us-west1-docker.pkg.dev/pbos-genesis-staging/pbos-executor/mb03-playbook-controller@sha256:"+"a".repeat(64);
 c.command=[EXECUTABLE];
 c.env.find(x=>x.name==="PBOS_PLAYBOOK_SOURCE_SHA").value="b".repeat(40);
 const {findings,status}=audit(job(false),old);
 assert.equal(status,"BLOCKED");
 for (const code of ["SIGNED_IMAGE_NOT_READINESS_PIN","SIGNED_ENTRYPOINT","SIGNED_SOURCE_PIN"]) assert.ok(findings.includes(code),code);
});
test("readiness cannot have signing material or execution authority",()=>{
 const bad=job(false);const spec=bad.spec.template.spec.template.spec;const c=spec.containers[0];
 c.env.find(x=>x.name==="PBOS_MISSION_EXECUTION_APPROVED").value="true";
 c.env.push(secretEnv("PBOS_MODEL_ADMIN_CREDENTIAL","do-not-log-the-secret"));
 c.volumeMounts.push({name:"provider-signing-key",mountPath:"/var/run/secrets/mb03/provider"});
 spec.volumes.push(privateVolume("provider-signing-key","mb03-provider-signing-key","private.pem"));
 const result=audit(bad,job(true));
 assert.equal(result.status,"BLOCKED");
 assert.ok(result.findings.includes("READINESS_EXECUTION_ENABLED"));
 assert.ok(result.findings.includes("READINESS_CONTAINS_PRIVATE_SIGNER"));
 assert.ok(result.findings.includes("READINESS_HAS_EXECUTION_CREDENTIALS"));
 assert.ok(!JSON.stringify(result).includes("do-not-log-the-secret"));
});
test("signed mode refuses missing signing mount, signing key env duplication and writable observation",()=>{
 const bad=job(true),spec=bad.spec.template.spec.template.spec,c=spec.containers[0];
 spec.volumes=spec.volumes.filter(v=>v.name!=="provider-signing-key");
 c.env.push(secretEnv("PBOS_PROVIDER_SIGNING_KEY_PEM","synthetic"));
 spec.volumes.find(v=>v.name==="observation-state").csi.readOnly=false;
 const result=audit(job(false),bad);
 assert.equal(result.status,"BLOCKED");
 for(const code of ["SIGNED_PROVIDER_SIGNING_KEY_SECRET_BINDING","SIGNED_HAS_DUPLICATE_ENV_PRIVATE_SIGNER","SIGNED_OBSERVATION_READONLY"])assert.ok(result.findings.includes(code),code);
});
test("unknown JSON job schema or missing mission job fails closed",()=>{
 assert.equal(audit(job(false),{}).status,"BLOCKED");
 assert.ok(audit({},job(true)).findings.includes("READINESS_STRUCTURE_UNRECOGNIZED"));
});
test("review-only mission YAML remains undeployable and does not auto-dispatch",()=>{
 const preview=readFileSync("infra/mb03/job.signed-mission.review-only.yaml","utf8");
 const readiness=readFileSync("job.mb03-readiness.yaml","utf8");
 const workflow=readFileSync(".github/workflows/mb03-playbook-controller-image.yml","utf8");
 assert.match(preview,/REPLACE_WITH_EXACT_APPROVED_EXECUTION_CONTROLLER_DIGEST/);
 assert.match(preview,/name: pbos-mb03-playbook-codex/);
 assert.match(preview,/name: PBOS_MISSION_EXECUTION_APPROVED\n\s+value: "true"/);
 assert.match(preview,/name: PBOS_PROVIDER_SIGNING_KEY_FILE\n\s+value: \/var\/lib\/pbos-private\/provider-private\.pem/);
 assert.match(preview,/name: PBOS_PLAYBOOK_SOURCE_SHA\n\s+value: 6bfa55c69f50b8872f8509a2e8f4e1fe8e415fea/);
 assert.doesNotMatch(preview,/name: PBOS_PROVIDER_SIGNING_KEY_PEM/);
 assert.match(readiness,/name: PBOS_MISSION_EXECUTION_APPROVED\n\s+value: "false"/);
 assert.doesNotMatch(workflow,/job\.signed-mission\.review-only\.yaml/);
});
