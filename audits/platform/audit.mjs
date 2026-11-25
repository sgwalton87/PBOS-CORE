#!/usr/bin/env node
/**
 * PBOS full-platform certification evaluator. Read-only, offline, and fail-closed.
 * Node 20+. No network, credentials, subprocesses, deployment, dispatch, or writes
 * other than explicit local report output.
 *
 * run: node audit.mjs --register register.json --observations evidence/observations.json --out results/current
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = raw => createHash('sha256').update(raw).digest('hex');
const strictDigest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const isTrue = v => v === true;
// Canonical contract from reviewed app source lib/pbos/activation-config.ts.
// Never allow a missing/empty observation to redefine a P0 requirement.
export const REQUIRED_ACTIVATION_KEYS = Object.freeze([
  "PBOS_API_URL", "PBOS_ORGANIZATION_ID", "PBOS_CONNECTOR_ID", "PBOS_CONNECTOR_KEY_ID",
  "PBOS_CONNECTOR_SECRET_BASE64", "PBOS_SCHOLAR_IDENTITY_APPROVAL_ID",
  "PBOS_SCHOLAR_EXCHANGE_APPROVAL_ID", "PBOS_SCHOLAR_ATHLETE_IDENTITY_APPROVAL_ID",
  "PBOS_SCHOLAR_ATHLETE_EXCHANGE_APPROVAL_ID", "PBOS_TRANSITION_YOUTH_IDENTITY_APPROVAL_ID",
  "PBOS_TRANSITION_YOUTH_EXCHANGE_APPROVAL_ID"
]);
export const CANONICAL_ROLES = Object.freeze([
  "scholar", "scholar-athlete", "transition-youth", "family", "mentor", "educator",
  "high-school-counselor", "coach", "college-coach", "college-admissions",
  "brand-partner", "employer", "district", "athlete-abroad", "other"
]);
const exactSet=(items,expected)=>Array.isArray(items)&&items.length===expected.length&&
  new Set(items).size===expected.length&&expected.every(x=>items.includes(x));
const validSha40=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const observed = (v, reasonFail, reasonUnknown) => v === true ? ['PASS', null] : v === false ? ['FAIL', reasonFail] : ['BLOCKED_UNKNOWN', reasonUnknown];
function gate(id, title, severity, scope, evaluate, refs = []) {
  const [status, reason] = evaluate();
  return { id, title, severity, scope, status, reason, evidenceSourceIds: refs };
}
const P = Object.freeze({
  cloud: ['SRC-GCP-AUDIT', 'SRC-GCP-CONTROL'],
  prod: ['SRC-VERCEL-ENV', 'SRC-VERCEL-PROJECT', 'SRC-APP-REPO'],
  roles: ['SRC-APP-QA', 'SRC-APP-QA-LOCAL', 'SRC-ROLE-REGISTRY'],
  db: ['SRC-SUPABASE-PROJECT', 'SRC-SUPABASE-ADVISORS'],
  neon: ['SRC-NEON'],
  org: ['SRC-PROJECT-TRACKER', 'SRC-APP-CURRENT-STATE']
});
export function evaluate(register, snapshot, now = new Date()) {
  if (register?.schema !== 'pbos.platform.gap-register.v2' || !Array.isArray(register.findings)) throw new Error('Unsupported or missing register');
  if (snapshot?.schema !== 'pbos.platform.observations.v1' || !snapshot.observations) throw new Error('Unsupported or missing observations');
  if (register.findings.length !== 106) throw new Error('Expected complete canonical 106-item register; partial register refused');
  const ids = new Set(register.findings.map(f=>f.id));
  if (ids.size !== 106 || !Array.from({length:106},(_,i)=>`G-${String(i+1).padStart(3,'0')}`).every(id=>ids.has(id))) throw new Error('Canonical gap IDs missing or duplicated');
  const keys = new Set((register.evidenceSources || []).map(e=>e.id));
  if (register.findings.some(f=>!f.evidenceSourceIds?.length || f.evidenceSourceIds.some(id=>!keys.has(id)))) throw new Error('Untraceable evidence source ID');
  const capturedMs = Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(capturedMs) || capturedMs > now.getTime() + 5*60000) throw new Error('Invalid or future-dated capture');
  const ageHours = Math.max(0, (now.getTime() - capturedMs)/3600000);
  const stale = ageHours > 24;
  const o = snapshot.observations, c = o.pbos || {}, a = o.playbook || {}, s = o.supabase || {}, n = o.neon || {}, gov = o.governance || {};
  const gates = [];
  const g = (...x) => gates.push(gate(...x));
  g('CLOUD-01','Signed-job exact configuration parity','P0','PBOS staging',()=>{
    if (c.signedJobParityStatus === 'BLOCKED' || (Array.isArray(c.signedJobParityCodes) && c.signedJobParityCodes.length)) return ['FAIL',`${c.signedJobParityCodes?.length ?? 'Unknown'} live signed-job discrepancies`];
    return c.signedJobParityStatus === 'PARITY_VERIFIED' && Array.isArray(c.signedJobParityCodes)
      ? ['PASS',null] : ['BLOCKED_UNKNOWN','Independent signed-job describe/parity evidence absent'];
  },P.cloud);
  g('CLOUD-02','Exact approved full digest matches deployed signed-job digest before authorization','P0','PBOS staging',()=>{
    const x=[c.approvedMissionFullImageDigest,c.currentJobFullImageDigest];
    if (!x.every(strictDigest)) return ['BLOCKED_UNKNOWN','Full approved and deployed signed-job digests unavailable; historic 5dhzb image is not the future release image'];
    return x[0]===x[1] && c.currentJobDigestIndependentlyAttested===true
      ? ['PASS',null]: ['FAIL','Deployed signed-job image does not match independently approved digest'];
  },P.cloud);
  g('CLOUD-03','Live signed-job startup wrapper and 0400 private key path attested','P0','PBOS staging',()=>{
    const x=[c.currentJobStartupCommandAttested,c.currentJobOperatorPublicKeyPathAttested];
    return x.includes(false) ? ['FAIL','Deployed signed job does not use reviewed private secret staging'] : x.every(isTrue)
      ? ['PASS',null]:['BLOCKED_UNKNOWN','Live signed job startup command and operator key path not both attested'];
  },['SRC-GCP-OPERATOR','SRC-GCP-CONTROL']);
  g('CLOUD-04','Current signed job generation fully reconciled','P0','PBOS staging',()=> {
    if(!Number.isSafeInteger(c.currentJobGeneration)||!Number.isSafeInteger(c.observedJobGeneration)||
      c.currentJobGeneration<1||c.observedJobGeneration<1)
      return ['BLOCKED_UNKNOWN','Full job generation and observedGeneration evidence missing'];
    return c.generationObservedMatch===true&&c.currentJobGeneration===c.observedJobGeneration
      ? ['PASS',null]:['FAIL','Job is not reconciled to observed generation'];
  },P.cloud);
  g('CLOUD-05','Mission 001 and 002 signed-run completion and receipts','P0','PBOS staging',()=> {
    const receipts=c.missionReceipts;
    const distinct=Array.isArray(receipts)&&receipts.length===2&&new Set(receipts.map(x=>x.missionId)).size===2;
    const proven=distinct&&receipts.every(x=>x.status==='CERTIFIED'&&validSha40(x.reviewedSourceSha)&&
      typeof x.independentEvidenceUrl==='string'&&x.independentEvidenceUrl.startsWith('https://'));
    return c.missionsCertified===2&&c.missionsRequired===2&&c.missionReceiptsValidated===true&&proven
      ?['PASS',null]:c.missionsCertified===0?['FAIL','0/2 signed missions certified']:
        ['BLOCKED_UNKNOWN','Signed mission receipts or independent evidence are incomplete'];
  },['SRC-GCP-OPERATOR','SRC-GCP-AUDIT']);
  g('CLOUD-06','Nonmission readiness signal — not signed-job authorization','P2','PBOS staging',()=>
    c.readinessPassed===true&&c.readinessCloudRunExecution==='pbos-mb03-playbook-readiness-vlzxs'&&
    strictDigest(c.readinessImageSha256)?['PASS',null]:['BLOCKED_UNKNOWN','No exact signed-free readiness execution and image evidence'],['SRC-GCP-READINESS']);
  g('CLOUD-07','Historic image-handoff incident reviewed and corrective gate installed','P1','PBOS staging',()=> {
    if(c.historyS7mkpImageDiffersFromCurrentJob===true && c.imageHandoffMitigationProven!==true)
      return ['FAIL','Historical image mismatch found; full digest handoff mitigation not yet proven'];
    return observed(c.imageHandoffMitigationProven,'Handoff remediation failed','Missing independent image-handoff remediation result');
  },['SRC-GCP-AUDIT']);
  const productionKeys = Array.isArray(a.productionEnvKeys)?a.productionEnvKeys:[];
  const missing = REQUIRED_ACTIVATION_KEYS.filter(x=>!productionKeys.includes(x));
  g('APP-01','Production PBOS endpoint, connector identity and approval configuration','P0','Playbook production',()=>{
    if (!Array.isArray(a.productionEnvKeys)||!exactSet(a.requiredProductionActivationKeys,REQUIRED_ACTIVATION_KEYS))
      return ['BLOCKED_UNKNOWN','Missing or invalid reviewed canonical activation contract'];
    if(missing.length)return ['FAIL',`${missing.length} protected production PBOS keys absent (names only; no secret values)`];
    return observed(a.productionPbosConnectivityAttested,'Signed production PBOS connectivity failed',
      'Inventory is present but a safe signed production connectivity test has not passed');
  },['SRC-VERCEL-ENV','SRC-APP-REPO']);
  g('APP-02','Exact app source revision deployed to custom-domain production','P0','Playbook production',()=>{
    if(!validSha40(a.mainCommit)||!validSha40(a.productionDeploymentCommit)) return ['BLOCKED_UNKNOWN','Exact 40-char source/deployment revisions missing'];
    if(a.mainCommit!==a.productionDeploymentCommit)return ['FAIL','Playbook production commit differs from main'];
    return observed(a.productionDomainDeploymentShaVerified,
      'Production custom domain does not serve accepted revision',
      'Matching repository/deployment metadata does not prove the custom domain serves this exact SHA');
  },P.prod);
  g('APP-03','Exact app release promoted by verified release authority','P0','Playbook production',()=> observed(a.explicitReleaseReceiptVerified,
    'Production release receipt invalid','AutoGit deploy status alone is not release certification; require exact-revision promotion receipt'),['SRC-APP-VERCEL-CONFIG','SRC-VERCEL-PROJECT']);
  g('APP-04','Live Scholar/Scholar-Athlete/Family acceptance configuration','P0','Playbook production',()=> a.lastProductionRoleQaConfigBlocked===true
    ? ['FAIL','Last main role journey QA failed before journeys (configuration)']:
    a.lastProductionRoleQaConfigBlocked===false?['PASS',null]:['BLOCKED_UNKNOWN','Production role QA unavailable'],['SRC-APP-QA','SRC-APP-PLATFORM-QA']);
  g('APP-05','All 15 roles: exact-release live positive and negative journey acceptance','P0','Playbook production',()=> {
    const exactRoles=exactSet(a.fullyCertifiedRoleNames,CANONICAL_ROLES);
    const matchingRevision=validSha40(a.productionDeploymentCommit)&&validSha40(a.liveRoleEvidenceRevision)&&
      a.liveRoleEvidenceRevision===a.productionDeploymentCommit;
    const independentlyRun=Number.isSafeInteger(a.liveRoleEvidenceRunId)&&a.liveRoleEvidenceRunId>0&&
      a.liveNegativeAuthorityTestsPassed===true;
    if(a.liveAcceptedAll15Roles===true&&exactRoles&&matchingRevision&&independentlyRun)return ['PASS',null];
    return ['BLOCKED_UNKNOWN',`No exact-revision authenticated, negative-case evidence for all 15 unique roles; currently ${new Set(a.fullyCertifiedRoleNames||[]).size}/15 unique role IDs recorded`];
  },P.roles);
  g('APP-06','Local-only isolated role tests (limited nonrelease signal)','P2','isolated local',()=>observed(a.localIsolated15RolesPassed,'Isolated QA failed','Local role QA result unavailable'),['SRC-APP-QA-LOCAL']);
  g('APP-07','Custom domain verified and production deployment READY (limited signal)','P2','Playbook production',()=> a.productionCustomDomainVerified===true&&a.productionDeploymentState==='READY'
    ? ['PASS',null]:['BLOCKED_UNKNOWN','Domain+READY status not jointly evidenced'],['SRC-VERCEL-PROJECT']);
  g('DB-01','Supabase public-schema RLS enabled (limited coverage)','P1','Supabase production',()=> Number.isInteger(s.publicTableCount)&&s.publicTableCount>0&&
    s.publicRlsInspectedTableCount===s.publicTableCount&&s.publicRlsDisabledCount===0
    ? ['PASS',null]:['BLOCKED_UNKNOWN','Full per-table public RLS inspection evidence missing'],['SRC-SUPABASE-PROJECT']);
  g('DB-02','All Supabase security advisory objects investigated','P0','Supabase production',()=> {
    const pending=(s.advisorObjectCounts?.anon_security_definer_function_executable||0)+(s.advisorObjectCounts?.authenticated_security_definer_function_executable||0)+(s.advisorObjectCounts?.auth_leaked_password_protection||0);
    const triaged=Array.isArray(s.securityWarningDispositions)&&s.securityWarningDispositions.length===pending&&
      new Set(s.securityWarningDispositions.map(x=>x.objectId)).size===pending&&
      s.securityWarningDispositions.every(x=>x.disposition==='ACCEPTED_BOUNDARY'||x.disposition==='REMEDIATED')&&
      s.securityWarningDispositions.every(x=>typeof x.evidenceUrl==='string'&&x.evidenceUrl.startsWith('https://'));
    return s.securityWarningsIndependentlyResolved===true&&triaged&&pending>0
      ? ['PASS',null]:pending>0?['REVIEW_REQUIRED',`${pending} WARN advisor object findings require distinct, independently documented dispositions`]:['BLOCKED_UNKNOWN','Security advisor disposition unknown'];
  },['SRC-SUPABASE-ADVISORS']);
  g('DB-03','Exact schema/migrations/RLS source-hosted parity certified','P0','Supabase production',()=> observed(s.hostedMigrationToSourceReconciliationPassed,'Hosted schema not aligned','169 applied migrations inventoried, complete source-to-hosted diff unproven'),['SRC-SUPABASE-PROJECT','SRC-APP-REPO']);
  g('DB-04','Supabase project operational health (limited signal)','P2','Supabase production',()=>s.status==='ACTIVE_HEALTHY'?['PASS',null]:['BLOCKED_UNKNOWN','Project health unverified'],['SRC-SUPABASE-PROJECT']);
  g('DATA-01','Neon fenced mission recovery verified','P0','PBOS staging',()=> observed(n.fenceAndNonceRecoveryCertified,'Neon fencing/recovery failed','Neon default branch ready does not prove protected lease or nonce recovery'),P.neon);
  g('OPS-01','Current authoritative release/task ledger','P1','governance',()=>observed(gov.currentReleaseLedgerAccepted,'Release ledger rejected','207-task July tracker is stale and has no actual reconciled owners/dependencies'),P.org);
  g('OPS-02','Isolated end-to-end restoration and rollback proof','P0','governance',()=>observed(gov.recoveryDrillCertified,'Rollback drill failed','No verified app+database+PBOS restore drill'),P.org);
  g('OPS-03','Independent scoped human launch authorization','P0','governance',()=>{
    if(gov.independentHumanLaunchApproval===false)return ['FAIL','Independent launch approval denied'];
    if(gov.independentHumanLaunchApproval===true&&validSha40(gov.approvedReleaseCommit)&&
      gov.approvedReleaseCommit===a.productionDeploymentCommit&&
      typeof gov.independentApprovalEvidenceUrl==='string'&&gov.independentApprovalEvidenceUrl.startsWith('https://'))
       return ['PASS',null];
    return ['BLOCKED_UNKNOWN','No exact-scope independent human launch decision and evidence locator'];
  },P.org);

  // A reviewer may submit exact-scope, immutable proof records. Merely changing a register
  // status cannot close findings. A proof record requires an external source, a test-run
  // locator and the independent reviewer. This is deterministic input validation,
  // not a substitute for trusted provider verification or a human launch signature.
  const proposedClosures=snapshot.closureEvidence || {};
  const isClosureValid=(f,proof)=> Boolean(!stale && proof && proof.findingId===f.id &&
    proof.result==='PASS' && /^[a-f0-9]{64}$/.test(proof.evidenceSha256||'') &&
    typeof proof.testRunLocator==='string' && /^(https:\/\/|provider:)/.test(proof.testRunLocator) &&
    typeof proof.reviewerId==='string' && proof.reviewerId.length>=3 &&
    typeof proof.reviewedAt==='string' && Number.isFinite(Date.parse(proof.reviewedAt)) &&
    Date.parse(proof.reviewedAt) <= now.getTime() &&
    Date.parse(proof.reviewedAt) >= now.getTime() - 24*3600000 &&
    Date.parse(proof.reviewedAt) >= capturedMs - 24*3600000 &&
    validSha40(proof.releaseCommitSha) && proof.releaseCommitSha===a.productionDeploymentCommit &&
    f.evidenceSourceIds.includes(proof.evidenceSourceId));
  const closure = register.findings.map(f=>{
    const certified=isClosureValid(f,proposedClosures[f.id]);
    return {id:f.id,priority:f.priority,section:f.section,
     originalEvidenceClass:f.originalEvidenceClass,observedState:f.evidenceStatus,
     closureStatus:certified?'CLOSED_WITH_EVIDENCE':'NOT_CLOSED',evidenceSpecificity:f.evidenceSpecificity,
     evidenceSourceIds:f.evidenceSourceIds,closureProof:f.closureProof,certified};
  });
  const byStatus = Object.fromEntries([...new Set(gates.map(x=>x.status))].sort().map(s=>[s,gates.filter(x=>x.status===s).length]));
  // Even green low-scope signals cannot justify a full launch. No release signing in this evaluator.
  const core = gates.filter(g=>g.severity!=='P2');
  const allGatesPass = core.every(g=>g.status==='PASS');
  const allFindingsClosed = closure.every(f=>f.closureStatus==='CLOSED_WITH_EVIDENCE'&&f.certified);
  const releaseStatus = !stale && allGatesPass && allFindingsClosed && gov.independentHumanLaunchApproval===true
       ? 'CERTIFICATION_ELIGIBLE_FOR_INDEPENDENT_REVIEW' : 'BLOCKED_NOT_LAUNCH_CERTIFIED';
  return {schema:'pbos.platform.audit-result.v1',evaluatedAt:now.toISOString(),capturedAt:snapshot.capturedAt,
    evidenceAgeHours:Number(ageHours.toFixed(2)),freshness:stale?'STALE_RECOLLECT_REQUIRED':'CURRENT_AS_OF_CAPTURE',
    releaseStatus,launchAuthorized:false,approvedSignedMissionExecution:false,
    scope:'evidence-ledger evaluation (no external systems changed)',
    totalFindings:closure.length,findingsClosed:closure.filter(f=>f.certified).length,
    gateSummary:byStatus,gates:stale?gates.map(g=>g.status==='PASS'?{...g,status:'STALE_EVIDENCE',reason:'Evidence snapshot >24h old'}:g):gates,
    closure,limitations:snapshot.limitations};
}
export function formatMarkdown(result, register, snapshot) {
 const lines=[
 '# PBOS / Playbook — Executable Systems Audit Result',
 '',`**Evaluated:** ${result.evaluatedAt}  `,`**Evidence captured:** ${result.capturedAt} (${result.freshness})  `,
 `**Release status:** **${result.releaseStatus}**  `,
 `**Items tracked:** ${result.totalFindings}; independently closed by this audit: ${result.findingsClosed}  `,
 '**Signed mission authorization:** NOT GRANTED. This audit is read-only.',
 '', '## Gate results', '', '| Gate | Status | Evidence-backed reason |', '|---|---|---|',
 ...result.gates.map(g=>`| ${g.id} — ${g.title} | ${g.status} | ${(g.reason||'Limited-scope check met').replaceAll('|','/')} |`),
 '', '## Why this is not a launch certificate',
 '','- A code build, a READY Vercel deployment, active Supabase database or passed nonmission readiness is not signed-mission or end-user certification.',
 '- Every numbered finding requires its specific closure proof. None is silently closed by category-level source links.',
 '- Approval, production release and signed mission dispatch require separate external authorization; this report cannot provide it.',
 '- Missing, stale, or provider-reported-only evidence is never converted to PASS.',
 '', '## Current forensic priorities',
 '', ...register.findings.filter(f=>f.priority==='P0' && ['A','B','C','D'].includes(f.section)).slice(0,20).map(f=>`- **${f.id}** ${f.finding} **Next proof:** ${f.closureProof}`),
 '', '## Evidence sources and limitations', '', ...register.evidenceSources.map(s=>`- **${s.id}** (${s.trust}): ${s.locator}`),
 '',...snapshot.limitations.map(x=>`- Limit: ${x}`),
 '', '## Reproduce', '', '```bash','node --test tests/audit.test.mjs', 'node audit.mjs --register register.json --observations evidence/observations.json --out results/current','```','',
 '**Do not treat this result as permission to execute signed missions or modify production.**',''
 ];return lines.join('\n');
}
function argsToMap(argv) {
 const res={};for(let i=0;i<argv.length;i+=2){const k=argv[i];if(!k?.startsWith('--')||!argv[i+1])throw new Error('Missing flag value');res[k.slice(2)]=argv[i+1];}return res;
}
function main(){
 try{
  const flags=argsToMap(process.argv.slice(2));
  for(const k of ['register','observations','out'])if(!flags[k])throw Error('Missing required --'+k);
  const regRaw=readFileSync(flags.register), obsRaw=readFileSync(flags.observations);
  const register=JSON.parse(regRaw), obs=JSON.parse(obsRaw);
  const result=evaluate(register,obs);
  result.inputHashes={registerSha256:sha(regRaw),observationsSha256:sha(obsRaw)};
  const out=resolve(flags.out);
  mkdirSync(dirname(out),{recursive:true});
  writeFileSync(out+'.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
  writeFileSync(out+'.md',formatMarkdown(result,register,obs),{mode:0o600});
  process.stdout.write(JSON.stringify({releaseStatus:result.releaseStatus,gateSummary:result.gateSummary,
    findings:result.totalFindings,findingsClosed:result.findingsClosed,output:out})+'\n');
  process.exitCode=result.releaseStatus==='CERTIFICATION_ELIGIBLE_FOR_INDEPENDENT_REVIEW'?0:2;
 }catch(e){console.error(JSON.stringify({status:'BLOCKED_AUDIT_ERROR',message:e.message}));process.exitCode=3;}
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();