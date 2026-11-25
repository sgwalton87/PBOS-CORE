import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate } from '../audit.mjs';

const reg=JSON.parse(readFileSync(new URL('../register.json',import.meta.url)));
const input=JSON.parse(readFileSync(new URL('../evidence/observations.json',import.meta.url)));
const current=new Date('2026-11-25T00:36:00Z');
const copy = o => structuredClone(o);
const gate=(r,id)=>r.gates.find(x=>x.id===id);

test('all canonical 106 findings and source IDs must remain traceable',()=>{
 const r=evaluate(reg,input,current);
 assert.equal(r.totalFindings,106);
 assert.equal(new Set(r.closure.map(x=>x.id)).size,106);
 assert.equal(r.findingsClosed,0);
 assert.equal(r.releaseStatus,'BLOCKED_NOT_LAUNCH_CERTIFIED');
 assert.equal(r.launchAuthorized,false);
 assert.equal(r.approvedSignedMissionExecution,false);
});
test('live signed controller drift remains FAIL despite passing readiness',()=>{
 const r=evaluate(reg,input,current);
 assert.equal(gate(r,'CLOUD-01').status,'FAIL');
 assert.equal(gate(r,'CLOUD-06').status,'PASS');
 assert.equal(gate(r,'CLOUD-02').status,'BLOCKED_UNKNOWN');
 assert.equal(gate(r,'CLOUD-03').status,'BLOCKED_UNKNOWN');
});
test('5dhzb user report cannot become independent passing forensics',()=>{
 const r=evaluate(reg,input,current);
 assert.equal(gate(r,'CLOUD-03').status,'BLOCKED_UNKNOWN');
 assert.equal(input.observations.pbos.history5dhzbEvidenceKind,'user-reported-not-independently-reconciled');
});
test('Vercel production PBOS connector absence is a confirmed failure',()=>{
 const r=evaluate(reg,input,current);
 assert.equal(gate(r,'APP-01').status,'FAIL');
 assert.equal(gate(r,'APP-02').status,'FAIL');
 assert.equal(gate(r,'APP-04').status,'FAIL');
});
test('passing isolated role tests never prove live role acceptance',()=>{
 const r=evaluate(reg,input,current);
 assert.equal(gate(r,'APP-06').status,'PASS');
 assert.equal(gate(r,'APP-05').status,'BLOCKED_UNKNOWN');
});
test('current Supabase warnings are review required, not false exploit assertions',()=>{
 const r=evaluate(reg,input,current);
 assert.equal(gate(r,'DB-01').status,'PASS');
 assert.equal(gate(r,'DB-02').status,'REVIEW_REQUIRED');
 assert.equal(gate(r,'DB-03').status,'BLOCKED_UNKNOWN');
});
test('audit rejects incomplete or modified canonical register',()=>{
 const r=copy(reg);r.findings.pop();assert.throws(()=>evaluate(r,input,current));
 const s=copy(reg);s.findings[1].id=s.findings[0].id;assert.throws(()=>evaluate(s,input,current));
});
test('audit rejects missing provenance references',()=>{
 const r=copy(reg);r.findings[0].evidenceSourceIds=['DOES_NOT_EXIST'];
 assert.throws(()=>evaluate(r,input,current),/Untraceable/);
});
test('audit must fail closed for missing snapshots',()=>{
 const s=copy(input);delete s.observations.playbook.productionEnvKeys;
 assert.equal(gate(evaluate(reg,s,current),'APP-01').status,'BLOCKED_UNKNOWN');
 const v=copy(input);delete v.observations.pbos.signedJobParityCodes;
 delete v.observations.pbos.signedJobParityStatus;
 assert.equal(gate(evaluate(reg,v,current),'CLOUD-01').status,'BLOCKED_UNKNOWN');
});
test('stale green evidence is explicitly downgraded',()=>{
 const r=evaluate(reg,input,new Date('2026-11-27T00:36:00Z'));
 assert.equal(r.freshness,'STALE_RECOLLECT_REQUIRED');
 assert.equal(gate(r,'CLOUD-06').status,'STALE_EVIDENCE');
 assert.equal(r.releaseStatus,'BLOCKED_NOT_LAUNCH_CERTIFIED');
});
test('source-trail-only linkage can never close a finding',()=>{
 const fake=copy(reg);fake.findings.forEach(f=>f.closureStatus='CLOSED_WITH_EVIDENCE');
 const r=evaluate(fake,input,current);
 assert.equal(r.findingsClosed,0);
 assert.equal(r.releaseStatus,'BLOCKED_NOT_LAUNCH_CERTIFIED');
});
test('fake closure with missing test or reviewer does not pass',()=>{
 const snap=copy(input);
 snap.closureEvidence={"G-001":{findingId:'G-001',result:'PASS',evidenceSourceId:'SRC-GCP-AUDIT',evidenceSha256:'a'.repeat(64)}};
 const r=evaluate(reg,snap,current);
 assert.equal(r.findingsClosed,0);
});
test('closure records require scoped revision, reviewer and evidence checksum',()=>{
 const snap=copy(input);
 snap.closureEvidence={"G-001":{
  findingId:'G-001',result:'PASS',evidenceSourceId:'SRC-GCP-AUDIT',evidenceSha256:'a'.repeat(64),
  reviewerId:'PlaybookNoReply',testRunLocator:'https://github.com/sgwalton87/PBOS-CORE/actions/runs/example',
  reviewedAt:'2026-11-25T00:35:00Z',releaseCommitSha:snap.observations.playbook.productionDeploymentCommit
 }};
 const r=evaluate(reg,snap,current);
 assert.equal(r.findingsClosed,1);
 assert.equal(r.releaseStatus,'BLOCKED_NOT_LAUNCH_CERTIFIED');
});
test('premature independent approval cannot override broken cloud and app gates',()=>{
 const snap=copy(input);snap.observations.governance.independentHumanLaunchApproval=true;
 const r=evaluate(reg,snap,current);
 assert.equal(r.releaseStatus,'BLOCKED_NOT_LAUNCH_CERTIFIED');
 assert.equal(gate(r,'APP-01').status,'FAIL');
});
test('historical failed image is NOT required to match a future approved image',()=>{
 const snap=copy(input);
 const p=snap.observations.pbos;
 p.approvedMissionFullImageDigest='a'.repeat(64);
 p.currentJobFullImageDigest='a'.repeat(64);
 p.currentJobDigestIndependentlyAttested=true;
 // Prior incident remains a historical mismatch, but does not poison a new digest check.
 p.execution5dhzbFullImageDigest='c'.repeat(64);
 assert.equal(gate(evaluate(reg,snap,current),'CLOUD-02').status,'PASS');
 assert.equal(gate(evaluate(reg,snap,current),'CLOUD-07').status,'FAIL');
});

test('Codex P2: stale closure evidence from 2020 cannot certify current findings',()=>{
 const snap=copy(input);
 snap.closureEvidence={'G-001':{
  findingId:'G-001',result:'PASS',evidenceSourceId:'SRC-GCP-AUDIT',evidenceSha256:'a'.repeat(64),
  reviewerId:'Independent Reviewer',testRunLocator:'https://github.com/sgwalton87/PBOS-CORE/actions/runs/1234',
  reviewedAt:'2020-01-01T00:00:00Z',releaseCommitSha:snap.observations.playbook.productionDeploymentCommit
 }};
 assert.equal(evaluate(reg,snap,current).findingsClosed,0);
 snap.closureEvidence['G-001'].reviewedAt='2026-11-25T00:35:00Z';
 assert.equal(evaluate(reg,snap,new Date('2026-11-28T00:36:00Z')).findingsClosed,0);
});
test('Codex P2: collector cannot redefine required activation contract as empty',()=>{
 const snap=copy(input);
 snap.observations.playbook.requiredProductionActivationKeys=[];
 snap.observations.playbook.productionEnvKeys=[];
 assert.equal(gate(evaluate(reg,snap,current),'APP-01').status,'BLOCKED_UNKNOWN');
});
test('Codex P2: duplicate roles and absent production revision never certify role matrix',()=>{
 const snap=copy(input);
 const a=snap.observations.playbook;
 a.liveAcceptedAll15Roles=true;
 a.fullyCertifiedRoleNames=Array(15).fill('scholar');
 a.liveRoleEvidenceRunId=12345;
 a.liveNegativeAuthorityTestsPassed=true;
 a.liveRoleEvidenceRevision=undefined;
 assert.equal(gate(evaluate(reg,snap,current),'APP-05').status,'BLOCKED_UNKNOWN');
 a.fullyCertifiedRoleNames=[
  'scholar','scholar-athlete','transition-youth','family','mentor','educator',
  'high-school-counselor','coach','college-coach','college-admissions',
  'brand-partner','employer','district','athlete-abroad','other'];
 assert.equal(gate(evaluate(reg,snap,current),'APP-05').status,'BLOCKED_UNKNOWN');
 a.liveRoleEvidenceRevision=a.productionDeploymentCommit;
 assert.equal(gate(evaluate(reg,snap,current),'APP-05').status,'PASS');
});
test('production connector variable names alone do not certify the signing transport',()=>{
 const snap=copy(input),a=snap.observations.playbook;
 a.productionEnvKeys=[...a.requiredProductionActivationKeys];
 assert.equal(gate(evaluate(reg,snap,current),'APP-01').status,'BLOCKED_UNKNOWN');
 a.productionPbosConnectivityAttested=true;
 assert.equal(gate(evaluate(reg,snap,current),'APP-01').status,'PASS');
});
test('security linter cannot pass without distinct per-object dispositions',()=>{
 const snap=copy(input),s=snap.observations.supabase;
 s.securityWarningsIndependentlyResolved=true;
 assert.equal(gate(evaluate(reg,snap,current),'DB-02').status,'REVIEW_REQUIRED');
});
test('generation boolean without actual numeric generation evidence never certifies',()=>{
 const snap=copy(input),p=snap.observations.pbos;
 p.generationObservedMatch=true;
 assert.equal(gate(evaluate(reg,snap,current),'CLOUD-04').status,'BLOCKED_UNKNOWN');
 p.currentJobGeneration=23;p.observedJobGeneration=22;
 assert.equal(gate(evaluate(reg,snap,current),'CLOUD-04').status,'FAIL');
 p.observedJobGeneration=23;
 assert.equal(gate(evaluate(reg,snap,current),'CLOUD-04').status,'PASS');
});

test('DB-02 rejects fabricated advisory identities even when the count matches',()=>{
 const snap=copy(input),s=snap.observations.supabase;
 const expected=Array.from({length:17},(_,i)=>({lintName:i===0?'anon_security_definer_function_executable':i===16?'auth_leaked_password_protection':'authenticated_security_definer_function_executable',schema:'public',objectId:'actual-'+i,arguments:'sig-'+i}));
 s.securityWarningIdentities=expected;
 s.securityWarningDispositions=expected.map((x,i)=>({lintName:x.lintName,schema:x.schema,objectId:'unrelated-'+i,arguments:x.arguments,disposition:'REMEDIATED',evidenceUrl:'https://example.invalid/'+i,evidenceSha256:'a'.repeat(64),independentEvidenceVerified:true}));
 s.securityWarningsIndependentlyResolved=true;
 assert.equal(gate(evaluate(reg,snap,current),'DB-02').status,'REVIEW_REQUIRED');
});

test('CLOUD-05 rejects receipts for unrelated missions even when all structural fields are present',()=>{
 const snap=copy(input),p=snap.observations.pbos;
 p.missionsCertified=2;p.missionsRequired=2;p.missionReceiptsValidated=true;
 p.missionReceipts=['UNRELATED-001','UNRELATED-002'].map((missionId,i)=>({
   missionId,status:'CERTIFIED',reviewedSourceSha:'a'.repeat(40),nonce:'nonce-'+i,approvalId:'approval-'+i,
   imageDigest:'b'.repeat(64),executionEvidenceSha256:'c'.repeat(64),
   independentEvidenceUrl:'https://example.invalid/receipt/'+i,independentEvidenceVerified:true
 }));
 assert.equal(gate(evaluate(reg,snap,current),'CLOUD-05').status,'BLOCKED_UNKNOWN');
});
