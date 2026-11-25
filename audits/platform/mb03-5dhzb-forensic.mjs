#!/usr/bin/env node
// Historical MB-03 Cloud Run execution forensics; READ ONLY, no credentials or dispatch.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const JOB="pbos-mb03-playbook-codex", EXEC="pbos-mb03-playbook-codex-5dhzb";
const mount={
  PBOS_APPROVAL_PUBLIC_KEY_FILE:"/var/lib/pbos-private/operator-public.pem",
  PBOS_PROVIDER_PUBLIC_KEY_FILE:"/var/lib/pbos-private/provider-public.pem",
  PBOS_PROVIDER_SIGNING_KEY_FILE:"/var/lib/pbos-private/provider-private.pem",
  PBOS_OBSERVATION_KEY_FILE:"/var/lib/pbos-private/observation-key"
};
const digest=x=>typeof x==="string"?x.match(/@sha256:([a-f0-9]{64})$/)?.[1]||null:null;
const end=x=>typeof x==="string"?x.split("/").at(-1):null;
const validGen=x=>typeof x==="number"?Number.isSafeInteger(x)&&x>0:typeof x==="string"&&/^[1-9][0-9]*$/.test(x);
function getContainer(j,isExecution){
 const p=isExecution?[j?.spec?.template?.spec,j?.template,j?.spec?.template?.spec?.template?.spec]:
 [j?.spec?.template?.spec?.template?.spec,j?.template?.template,j?.template];
 const specs=p.filter(x=>Array.isArray(x?.containers)&&x.containers.length===1);
 return specs.length===1?specs[0].containers[0]:null;
}
function checkContainer(c,scope,err){
 if(!c){err.push(scope+"_SPEC_UNREADABLE");return null}
 const env=new Map((c.env||[]).map(x=>[x.name,x]));
 if(c.command?.length!==1||c.command[0]!=="/usr/local/bin/mb03-stage-secrets")err.push(scope+"_STAGING_WRAPPER_MISSING");
 if(JSON.stringify(c.args)!==JSON.stringify(["./node_modules/.bin/tsx","pbos/tools/mb03-protected-playbook-codex.ts"]))err.push(scope+"_CONTROLLER_ARGS_DRIFT");
 for(const [key,v] of Object.entries(mount))if(env.get(key)?.value!==v)err.push(scope+"_"+key+"_UNSTAGED");
 if(env.has("PBOS_PROVIDER_SIGNING_KEY_PEM"))err.push(scope+"_DUPLICATE_PRIVATE_SIGNER_ENV");
 if(env.get("PBOS_MISSION_EXECUTION_APPROVED")?.value!=="true")err.push(scope+"_MISSION_MODE_MISSING");
 if(env.get("PBOS_MISSION_INPUT_FILE")?.value!=="/var/lib/pbos-missions/mission.json")err.push(scope+"_INPUT_PATH_DRIFT");
 for(const [n,path] of Object.entries({"operator-public-key":"/var/run/secrets/mb03/operator",
 "provider-public-key":"/var/run/secrets/mb03/provider-public","provider-signing-key":"/var/run/secrets/mb03/provider",
 "observation-key":"/var/run/secrets/mb03/observation"}))
   if(!(c.volumeMounts||[]).some(x=>x.name===n&&x.mountPath===path))err.push(scope+"_SECRET_MOUNT_"+n.toUpperCase().replaceAll("-","_")+"_DRIFT");
 const d=digest(c.image);
 if(!d)err.push(scope+"_IMAGE_NOT_DIGEST_PINNED");
 return {imageSha256:d};
}
export function inspect(job,exec){
 const e=[];
 if(end(job?.metadata?.name||job?.name)!==JOB)e.push("SIGNED_JOB_NAME_WRONG");
 if(end(exec?.metadata?.name||exec?.name)!==EXEC)e.push("HISTORICAL_EXECUTION_NAME_WRONG");
 if(typeof exec?.job==="string"&&end(exec.job)!==JOB)e.push("EXECUTION_PARENT_WRONG");
 const j=checkContainer(getContainer(job,false),"SIGNED_JOB",e);
 const x=checkContainer(getContainer(exec,true),"FAILED_EXECUTION",e);
 const generation=job?.metadata?.generation??job?.generation;
 const observed=job?.status?.observedGeneration??job?.observedGeneration;
 if(!validGen(generation)||!validGen(observed))e.push("GENERATION_EVIDENCE_MISSING");
 else if(String(generation)!==String(observed)||job?.reconciling===true)e.push("GENERATION_NOT_RECONCILED");
 if(j?.imageSha256&&x?.imageSha256&&j.imageSha256!==x.imageSha256)e.push("HISTORICAL_IMAGE_DIFFERS_FROM_CURRENT_JOB");
 return {
  schema:"pbos.mb03.forensic.v1",historicalExecution:EXEC,
  status:e.length?"BLOCKED_FORENSICS_FOUND":"HISTORIC_SPEC_CONSISTENT_NOT_RUNTIME_CERTIFIED",
  findings:[...new Set(e)].sort(),
  signedJobImageSha256:j?.imageSha256??null,historicalImageSha256:x?.imageSha256??null,
  jobGeneration:validGen(generation)?String(generation):null,
  observedGeneration:validGen(observed)?String(observed):null,
  actualPrivateFileMode0400Verified:false,missionExecuted:false,missionAuthorized:false,
  caution:"Historical/current specs cannot prove mounted runtime file mode or authorize a signed retry."
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==4)throw Error("ARGS");
  const r=inspect(JSON.parse(readFileSync(process.argv[2],"utf8")),JSON.parse(readFileSync(process.argv[3],"utf8")));
  console.log(JSON.stringify(r));process.exitCode=r.findings.length?2:0;
 }catch{console.log(JSON.stringify({status:"BLOCKED",findings:["FORENSIC_INPUT_INVALID_OR_UNREADABLE"]}));process.exitCode=3}
}
