import test from "node:test";
import assert from "node:assert/strict";
import { inspectFailedExecution, MISSION_JOB, INCIDENT_EXECUTION } from "./audit-execution-image-provenance.mjs";

const prefix="us-west1-docker.pkg.dev/pbos-genesis-staging/pbos-executor/mb03-playbook-controller@sha256:";
const good=prefix+"a".repeat(64), old=prefix+"c".repeat(64);
const job=(image=good, generation=20, observedGeneration=20)=>({
 metadata:{name:MISSION_JOB,generation},status:{observedGeneration},
 spec:{template:{spec:{template:{spec:{containers:[{image}]}}}}}
});
const oldExec=(image=old)=>({
 metadata:{name:INCIDENT_EXECUTION},job:"projects/pbos-genesis-staging/locations/us-west1/jobs/"+MISSION_JOB,
 spec:{template:{spec:{containers:[{image}]}}}
});
const newExec=(image=good)=>({
 name:"projects/pbos-genesis-staging/locations/us-west1/jobs/"+MISSION_JOB+"/executions/"+INCIDENT_EXECUTION,
 job:"projects/pbos-genesis-staging/locations/us-west1/jobs/"+MISSION_JOB,
 template:{containers:[{image}]}
});
test("v1 historical execution image disagreement with current signed job is diagnosed without credentials",()=>{
 const result=inspectFailedExecution(job(),oldExec());
 assert.equal(result.status,"FORENSIC_ONLY_NOT_MISSION_READY");
 assert.ok(result.findings.includes("INCIDENT_EXECUTION_IMAGE_DIFFERS_FROM_CURRENT_JOB"));
 assert.equal(result.currentJobImageMatchesFailedExecution,false);
 assert.equal(result.missionAuthorized,false);
 assert.equal(result.executionAttempted,false);
});
test("v2 execution image matches signed job but is never treated as signed-mission authorization",()=>{
 const result=inspectFailedExecution(job(),newExec());
 assert.deepEqual(result.findings,[]);
 assert.equal(result.currentJobImageMatchesFailedExecution,true);
 assert.equal(result.missionAuthorized,false);
});
test("image tags and missing digests are rejected as unpinned",()=>{
 const result=inspectFailedExecution(job("registry.example/test:latest"),oldExec("registry.example/test:latest"));
 assert.ok(result.findings.includes("SIGNED_JOB_IMAGE_NOT_DIGEST_PINNED"));
 assert.ok(result.findings.includes("INCIDENT_IMAGE_NOT_DIGEST_PINNED"));
});
test("Cloud Run job reconciliation not finished must block mission admission",()=>{
 const result=inspectFailedExecution(job(good,20,19),newExec());
 assert.ok(result.findings.includes("SIGNED_JOB_GENERATION_NOT_RECONCILED"));
});
test("missing or invalid Cloud Run reconciliation generation evidence fails closed",()=>{
 const missingObserved=job(good,23,undefined);
 delete missingObserved.status.observedGeneration;
 const a=inspectFailedExecution(missingObserved,newExec());
 assert.ok(a.findings.includes("SIGNED_JOB_GENERATION_EVIDENCE_MISSING"));
 const missingBoth=job(good,undefined,undefined);
 delete missingBoth.metadata.generation;
 delete missingBoth.status.observedGeneration;
 assert.ok(inspectFailedExecution(missingBoth,newExec()).findings.includes("SIGNED_JOB_GENERATION_EVIDENCE_MISSING"));
 const invalid=job(good,"unknown",23);
 assert.ok(inspectFailedExecution(invalid,newExec()).findings.includes("SIGNED_JOB_GENERATION_EVIDENCE_MISSING"));
 const valid=job(good,23,23);
 assert.ok(!inspectFailedExecution(valid,newExec()).findings.includes("SIGNED_JOB_GENERATION_EVIDENCE_MISSING"));
});
test("wrong execution parent and identity are rejected",()=>{
 const bad=oldExec();
 bad.metadata.name="pbos-mb03-playbook-codex-OTHER";
 bad.job="projects/pbos-genesis-staging/locations/us-west1/jobs/another-job";
 const result=inspectFailedExecution(job(),bad);
 assert.ok(result.findings.includes("INCIDENT_EXECUTION_IDENTITY_MISMATCH"));
 assert.ok(result.findings.includes("EXECUTION_PARENT_JOB_MISMATCH"));
});
test("malformed or multiple-container execution does not produce a false image match",()=>{
 const x=oldExec();
 x.spec.template.spec.containers=[];
 const result=inspectFailedExecution(job(),x);
 assert.ok(result.findings.includes("INCIDENT_EXECUTION_IMAGE_UNREADABLE"));
 assert.equal(result.currentJobImageMatchesFailedExecution,false);
});
test("diagnostic response cannot leak metadata or confidential environment bindings",()=>{
 const x=newExec();
 x.template.containers[0].env=[{name:"PBOS_PROVIDER_SIGNING_KEY_PEM",value:"VERY_PRIVATE_KEY"}];
 x.metadata={secret:"VERY_PRIVATE_KEY"};
 const result=inspectFailedExecution(job(),x);
 assert.equal(JSON.stringify(result).includes("VERY_PRIVATE_KEY"),false);
});
