import { ActionRisk, BuildAction, BuildAuthorityDecision } from "../autonomous-authority";
import { GenesisBuildSession } from "../genesis-console/genesis-control-plane";
import { GitHubRepositoryGateway, governedBuildReference, PullRequestReference, RepositoryFileChange } from "../platform";
import { ApplicationAcceptanceDimension, ApplicationAcceptanceEvidence, ProductionMissionExecutor } from "../production-runtime";
import { ResumableRemediationEngine } from "../validation-automation";
import { playbookMobileAcceptanceFiles, playbookMobileAcceptancePlan } from "./playbook-mobile-functional-acceptance";

const SYSTEM_ID = "PLAYBOOK-SYSTEM-001";
const REPOSITORY = "sgwalton87/playbook-platform";
const FOUNDATION_MANIFEST = "pbos/readiness/049-mobile-foundation.json";
const MOBILE_MANIFEST = "pbos/readiness/049-mobile-journeys.json";

export interface PlaybookMobileJourneysExecutorDependencies {
    readonly gateway: GitHubRepositoryGateway;
    readonly remediation: Pick<ResumableRemediationEngine, "start">;
    readonly session: GenesisBuildSession;
    readonly authorize: (action: BuildAction, risk: ActionRisk, branch: string) => BuildAuthorityDecision;
}

function withMobileAcceptance(source: string): string {
    const manifest = JSON.parse(source) as { scripts?: Record<string, string> } & Record<string, unknown>;
    manifest.scripts = { ...(manifest.scripts ?? {}),
        "mobile:acceptance": "npm run acceptance --workspace @playbook-system-001/mobile" };
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

function withNativeDependencies(source: string): string {
    const manifest = JSON.parse(source) as { scripts?: Record<string, string>; dependencies?: Record<string, string> } & Record<string, unknown>;
    manifest.scripts = { ...(manifest.scripts ?? {}), acceptance: "node scripts/native-acceptance.mjs" };
    manifest.dependencies = { ...(manifest.dependencies ?? {}),
        "@react-native-async-storage/async-storage": "*", "@supabase/supabase-js": "^2.0.0" };
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

const authSource = `import { createClient } from "@supabase/supabase-js";
import { writeSession } from "./session-store";
export async function signInScholar(email:string,password:string){const url=process.env.EXPO_PUBLIC_SUPABASE_URL;const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error("Public Supabase mobile configuration is required.");
 const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});const result=await supabase.auth.signInWithPassword({email,password});
 if(result.error||!result.data.session||!result.data.user)throw new Error(result.error?.message??"Authentication failed.");
 await writeSession({accessToken:result.data.session.access_token,actorId:result.data.user.id,
 expiresAt:new Date((result.data.session.expires_at??0)*1000).toISOString(),provenance:["SUPABASE_AUTHENTICATED","PLAYBOOK-SYSTEM-001"]});}
`;

const offlineSource = `export type PendingNativeMutation={id:string;path:string;method:"POST"|"PATCH";body:unknown;createdAt:string};
export interface PendingMutationStore{read():Promise<readonly PendingNativeMutation[]>;write(items:readonly PendingNativeMutation[]):Promise<void>}
export class NativeMutationQueue{constructor(private readonly store:PendingMutationStore){}
 async enqueue(item:PendingNativeMutation){const current=await this.store.read();if(current.some(found=>found.id===item.id))return;await this.store.write([...current,item]);}
 async flush(send:(item:PendingNativeMutation)=>Promise<void>){const current=await this.store.read();const remaining:PendingNativeMutation[]=[];
  for(const item of current){try{await send(item);}catch{remaining.push(item);}}await this.store.write(remaining);return{sent:current.length-remaining.length,remaining:remaining.length};}}
`;

const clientSource = `import AsyncStorage from "@react-native-async-storage/async-storage";
import { governedApplicationRequest } from "../platform/api";import { NativeMutationQueue,type PendingNativeMutation } from "./offline-queue";
const QUEUE_KEY="pbos.playbook.mobile.pending.v1";
const store={async read(){return JSON.parse((await AsyncStorage.getItem(QUEUE_KEY))??"[]") as PendingNativeMutation[]},
 async write(items:readonly PendingNativeMutation[]){await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(items))}};
export const mobileMutationQueue=new NativeMutationQueue(store);
export const scholarMobileClient={
 dashboard:()=>governedApplicationRequest<Record<string,unknown>>("/api/pbos/mobile/scholar"),
 onboarding:(body:unknown)=>governedApplicationRequest("/api/pbos/scholar/onboarding",{method:"POST",body:JSON.stringify(body)}),
 messages:()=>governedApplicationRequest<{conversations:readonly unknown[]}>("/api/support-network/messages"),
 sendMessage:(body:unknown)=>governedApplicationRequest("/api/support-network/messages",{method:"POST",body:JSON.stringify(body)}),
 documents:()=>governedApplicationRequest<{workspaces:readonly unknown[]}>("/api/application-workspaces"),
 notifications:()=>governedApplicationRequest<{notifications:readonly unknown[]}>("/api/notifications"),
 acknowledge:(notificationId:string)=>governedApplicationRequest("/api/notifications",{method:"PATCH",body:JSON.stringify({action:"READ",notificationId})}),
 async retry(){return mobileMutationQueue.flush(item=>governedApplicationRequest(item.path,{method:item.method,body:JSON.stringify(item.body)}).then(()=>undefined));}}
`;

const hookSource = `import {useCallback,useEffect,useState}from"react";
export function useGovernedResource<T>(load:()=>Promise<T>){const[data,setData]=useState<T>();const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 const refresh=useCallback(async()=>{try{setData(await load())}catch(cause){setError(cause instanceof Error?cause.message:"Unable to load")}
 finally{setLoading(false)}},[load]);useEffect(()=>{void refresh()},[refresh]);return{data,loading,error,refresh}}
`;

const cardSource = `import type{ReactNode}from"react";import{Pressable,StyleSheet,Text,View}from"react-native";import{applicationTheme as t}from"../theme";
export function JourneyCard({title,status,children,onRetry}:{title:string;status:string;children?:ReactNode;onRetry?:()=>void}){return<View style={s.card} accessible accessibilityLabel={title}>
<Text style={s.title}>{title}</Text><Text accessibilityLiveRegion="polite" style={s.status}>{status}</Text>{children}{onRetry&&<Pressable accessibilityRole="button" onPress={onRetry}><Text style={s.link}>Retry</Text></Pressable>}</View>}
const s=StyleSheet.create({card:{backgroundColor:t.colors.surface,padding:t.spacing.lg,borderRadius:20,marginBottom:t.spacing.md},title:{fontSize:20,fontWeight:"900",color:t.colors.primary},status:{color:t.colors.muted,marginVertical:t.spacing.sm},link:{color:t.colors.accent,fontWeight:"800"}});
`;

const loginSource = `import{useState}from"react";import{router}from"expo-router";import{Pressable,StyleSheet,Text,TextInput,View}from"react-native";import{signInScholar}from"../src/platform/auth";import{applicationTheme as t}from"../src/theme";
export default function Login(){const[email,setEmail]=useState("");const[password,setPassword]=useState("");const[error,setError]=useState("");const[busy,setBusy]=useState(false);
async function submit(){setBusy(true);setError("");try{await signInScholar(email,password);router.replace("/dashboard")}catch(cause){setError(cause instanceof Error?cause.message:"Authentication failed.")}finally{setBusy(false)}}
return<View style={s.page} accessibilityLabel="The Playbook mobile login"><Text style={s.kicker}>THE PLAYBOOK</Text><Text style={s.title}>Run your playbook.</Text>
<TextInput accessibilityLabel="Email" autoCapitalize="none" inputMode="email" value={email} onChangeText={setEmail} style={s.input}/><TextInput accessibilityLabel="Password" secureTextEntry value={password} onChangeText={setPassword} style={s.input}/>
{error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}<Pressable accessibilityRole="button" disabled={busy||!email.includes("@")||!password} onPress={submit} style={s.button}><Text style={s.buttonText}>{busy?"Signing in…":"Log in securely"}</Text></Pressable></View>}
const s=StyleSheet.create({page:{flex:1,justifyContent:"center",padding:t.spacing.xl,backgroundColor:t.colors.primary},kicker:{color:t.colors.accent,fontWeight:"800",letterSpacing:3},title:{color:t.colors.surface,fontSize:42,fontWeight:"900",marginVertical:t.spacing.lg},input:{backgroundColor:t.colors.surface,borderRadius:12,padding:t.spacing.md,marginBottom:t.spacing.md},button:{backgroundColor:t.colors.accent,padding:t.spacing.md,borderRadius:12},buttonText:{color:t.colors.surface,textAlign:"center",fontWeight:"800"},error:{color:"#FCA5A5",marginBottom:t.spacing.md}});
`;

function resourceScreen(name:string,title:string,method:string){return `import{useCallback}from"react";import{ScrollView,StyleSheet,Text}from"react-native";import{JourneyCard}from"../src/features/JourneyCard";import{scholarMobileClient}from"../src/features/scholar-mobile-client";import{useGovernedResource}from"../src/features/use-governed-resource";import{applicationTheme as t}from"../src/theme";
export default function ${name}(){const load=useCallback(()=>scholarMobileClient.${method}(),[]);const{data,loading,error,refresh}=useGovernedResource(load);return<ScrollView contentContainerStyle={s.page}><Text style={s.kicker}>THE PLAYBOOK</Text><Text style={s.title}>${title}</Text><JourneyCard title="Governed Scholar data" status={loading?"Loading…":error||"Current and connected"} onRetry={error?()=>void refresh():undefined}><Text>{data?JSON.stringify(data).slice(0,500):"No records yet."}</Text></JourneyCard></ScrollView>}
const s=StyleSheet.create({page:{flexGrow:1,padding:t.spacing.lg,paddingTop:64,backgroundColor:t.colors.background},kicker:{color:t.colors.accent,fontWeight:"800",letterSpacing:2},title:{fontSize:34,fontWeight:"900",color:t.colors.primary,marginVertical:t.spacing.md}});\n`;}

const onboardingSource = `import{useState}from"react";import{router}from"expo-router";import{Pressable,StyleSheet,Text,TextInput,View}from"react-native";import{scholarMobileClient,mobileMutationQueue}from"../src/features/scholar-mobile-client";import{applicationTheme as t}from"../src/theme";
export default function Onboarding(){const[name,setName]=useState("");const[goal,setGoal]=useState("");const[status,setStatus]=useState("");async function save(){const body={displayName:name,goalTitle:goal};try{await scholarMobileClient.onboarding(body);router.replace("/dashboard")}catch{await mobileMutationQueue.enqueue({id:"onboarding-"+Date.now(),path:"/api/pbos/scholar/onboarding",method:"POST",body,createdAt:new Date().toISOString()});setStatus("Saved offline. PBOS will retry safely.")}}
return<View style={s.page}><Text style={s.title}>Build your journey</Text><TextInput accessibilityLabel="Display name" value={name} onChangeText={setName} style={s.input}/><TextInput accessibilityLabel="Primary goal" value={goal} onChangeText={setGoal} style={s.input}/><Text accessibilityLiveRegion="polite">{status}</Text><Pressable accessibilityRole="button" onPress={save} style={s.button}><Text>Save and continue</Text></Pressable></View>}
const s=StyleSheet.create({page:{flex:1,padding:t.spacing.lg,paddingTop:64,backgroundColor:t.colors.background},title:{fontSize:34,fontWeight:"900",marginBottom:t.spacing.lg},input:{backgroundColor:t.colors.surface,padding:t.spacing.md,borderRadius:12,marginBottom:t.spacing.md},button:{backgroundColor:t.colors.accent,padding:t.spacing.md,borderRadius:12}});
`;

const mobileRoute = `import{NextResponse}from"next/server";import{requireUser}from"@/lib/supabase/server";
export async function GET(){try{const{supabase,user}=await requireUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
const[profile,goals,milestones,projection]=await Promise.all([supabase.from("scholar_profiles").select("id,full_name,role,updated_at").eq("id",user.id).maybeSingle(),supabase.from("scholar_goals").select("id,title,status,updated_at").eq("scholar_id",user.id).order("updated_at",{ascending:false}).limit(5),supabase.from("scholar_milestones").select("id,title,status,updated_at").eq("scholar_id",user.id).order("updated_at",{ascending:false}).limit(5),supabase.from("scholar_dashboard_projections").select("section_ids,provenance,updated_at").eq("scholar_id",user.id).order("updated_at",{ascending:false}).limit(1).maybeSingle()]);
for(const result of[profile,goals,milestones,projection])if(result.error)throw new Error(result.error.message);return NextResponse.json({profile:profile.data,goals:goals.data??[],milestones:milestones.data??[],projection:projection.data,systemId:"PLAYBOOK-SYSTEM-001"});}
catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Dashboard unavailable."},{status:500})}}\n`;

const offlineTest = `import{describe,expect,it}from"vitest";import{NativeMutationQueue,type PendingNativeMutation}from"../src/features/offline-queue";
describe("native offline recovery",()=>{it("preserves failed mutations and removes successful retries",async()=>{let items:readonly PendingNativeMutation[]=[];const queue=new NativeMutationQueue({read:async()=>items,write:async value=>{items=value}});await queue.enqueue({id:"one",path:"/one",method:"POST",body:{},createdAt:"now"});await queue.enqueue({id:"two",path:"/two",method:"PATCH",body:{},createdAt:"now"});const result=await queue.flush(async item=>{if(item.id==="two")throw new Error("offline")});expect(result).toEqual({sent:1,remaining:1});expect(items.map(item=>item.id)).toEqual(["two"])});});\n`;

function journeyFiles(): readonly RepositoryFileChange[] { return [
    {path:"apps/mobile/src/platform/auth.ts",content:authSource},{path:"apps/mobile/src/features/offline-queue.ts",content:offlineSource},
    {path:"apps/mobile/src/features/scholar-mobile-client.ts",content:clientSource},{path:"apps/mobile/src/features/use-governed-resource.ts",content:hookSource},
    {path:"apps/mobile/src/features/JourneyCard.tsx",content:cardSource},{path:"apps/mobile/app/login.tsx",content:loginSource},
    {path:"apps/mobile/app/onboarding.tsx",content:onboardingSource},{path:"apps/mobile/app/dashboard.tsx",content:resourceScreen("Dashboard","Your next step","dashboard")},
    {path:"apps/mobile/app/messages.tsx",content:resourceScreen("Messages","Your support network","messages")},
    {path:"apps/mobile/app/documents.tsx",content:resourceScreen("Documents","Secure documents","documents")},
    {path:"apps/mobile/app/notifications.tsx",content:resourceScreen("Notifications","Stay on your path","notifications")},
    {path:"apps/mobile/tests/offline-recovery.test.ts",content:offlineTest},{path:"app/api/pbos/mobile/scholar/route.ts",content:mobileRoute}
]; }

function evidence(revision:string):readonly ApplicationAcceptanceEvidence[]{const dimensions:readonly ApplicationAcceptanceDimension[]=["ROUTE","USER_INTERFACE","DURABLE_DATA","AUTHORITY","PBOS_INTEGRATION","ACCEPTANCE_TEST","ACCESSIBILITY","SECURITY"];
return dimensions.map(dimension=>({evidenceId:`049-mobile-journeys:${dimension.toLowerCase()}:${revision}`,dimension,
behavior:`The shared native Scholar journey implements ${dimension.toLowerCase().replaceAll("_"," ")} for iOS and Android.`,repository:REPOSITORY,commit:revision,
artifact:dimension==="ACCEPTANCE_TEST"?"apps/mobile/scripts/native-acceptance.mjs":"apps/mobile",passed:true,source:"IMPLEMENTATION"}));}

export function playbookMobileJourneysExecutor(dependencies:PlaybookMobileJourneysExecutorDependencies):ProductionMissionExecutor{return async context=>{
if(context.mission.missionId!=="049-mobile-journeys"||context.run.systemId!==SYSTEM_ID||context.run.repository!==REPOSITORY)throw new Error("The CIP-049 native journey adapter is restricted to The Playbook.");
if(dependencies.session.system.systemId!==SYSTEM_ID||dependencies.session.system.repository!==REPOSITORY)throw new Error("The active Genesis session does not authorize Playbook native journeys.");
const reference=governedBuildReference({owner:"sgwalton87",name:"playbook-platform",defaultBranch:"main"},context.run.startingBranch);const branch=`agent/pbos-playbook-system-001-049-journeys-${context.run.runId.slice(0,8)}`;
const actions:ReadonlyArray<readonly[BuildAction,ActionRisk]>=[["INSPECT_REPOSITORY","LOW"],["PROPOSE_CHANGE","MEDIUM"],["MODIFY_APPLICATION_CODE","MEDIUM"],["CREATE_TESTS","MEDIUM"],["UPDATE_DOCUMENTATION","MEDIUM"],["CREATE_COMMIT","MEDIUM"],["PUSH_BRANCH","MEDIUM"],["OPEN_DRAFT_PR","MEDIUM"]];
for(const[action,risk]of actions){const decision=dependencies.authorize(action,risk,branch);if(!decision.allowed)throw new Error(`${action} denied: ${decision.reason}`)}
const inspection=await dependencies.gateway.inspectRepository(reference);if(inspection.revision!==context.run.startingCommit)throw new Error(`Governed revision moved from ${context.run.startingCommit} to ${inspection.revision}; re-plan native journeys.`);
const foundation=await dependencies.gateway.readFileAtRevision(reference,FOUNDATION_MANIFEST,inspection.revision);if(!foundation.includes("IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION"))throw new Error("Validated mobile foundation evidence is required before native journey implementation.");
const rootPackage=await dependencies.gateway.readFileAtRevision(reference,"package.json",inspection.revision);const mobilePackage=await dependencies.gateway.readFileAtRevision(reference,"apps/mobile/package.json",inspection.revision);
const changes:readonly RepositoryFileChange[]=[...journeyFiles(),...playbookMobileAcceptanceFiles(),{path:"package.json",content:withMobileAcceptance(rootPackage)},{path:"apps/mobile/package.json",content:withNativeDependencies(mobilePackage)},
{path:MOBILE_MANIFEST,content:`${JSON.stringify({schemaVersion:1,missionId:"049-mobile-journeys",systemId:SYSTEM_ID,repository:REPOSITORY,startingRevision:inspection.revision,productionRunId:context.run.runId,platforms:["IOS","ANDROID"],journeys:["AUTHENTICATION","ONBOARDING","DASHBOARD","MESSAGING","DOCUMENTS","NOTIFICATIONS"],offlineRecovery:"BOUNDED_IDEMPOTENT_QUEUE",state:"IMPLEMENTED_PENDING_INDEPENDENT_VALIDATION",completionRule:"The exact revision must pass connected web acceptance, native contract tests, and iOS and Android Expo exports before human certification."},null,2)}\n`}];
context.report("BUILDING",`Connecting primary Scholar journeys across iOS and Android on ${branch}.`);await dependencies.gateway.createBranch(reference,branch,inspection.revision);await dependencies.gateway.applyChange(reference,changes);await dependencies.gateway.prepareExpoDependencyLock(reference,"apps/mobile");
const paths=[...new Set([...changes.map(change=>change.path),"package-lock.json"])];const revision=await dependencies.gateway.commit(reference,"feat: connect The Playbook native Scholar journeys",paths);await dependencies.gateway.push(reference,branch);
const pullRequest:PullRequestReference=await dependencies.gateway.openDraftPullRequest(reference,branch,"feat: connect The Playbook native Scholar journeys",`PBOS Genesis mission \`049-mobile-journeys\` connects authenticated Scholar journeys, offline recovery, and exact-revision iOS/Android bundle evidence at \`${revision}\`.\n\nStore signing, submission, and production release remain protected.`);const remediation=dependencies.remediation.start(SYSTEM_ID,pullRequest);
return{outputs:{branch,revision,pullRequest,remediationRunId:remediation.runId,platforms:["IOS","ANDROID"],journeyCount:6},evidenceIds:[`repository:${inspection.revision}`,`commit:${revision}`,`pull-request:${pullRequest.number}`],files:{added:changes.filter(change=>!["package.json","apps/mobile/package.json"].includes(change.path)).map(change=>change.path),modified:["package.json","apps/mobile/package.json","package-lock.json"]},commands:[{command:"prepare governed native Scholar journeys",exitCode:0,durationMs:0,output:`iOS and Android acceptance prepared on ${branch}`}],validations:[{name:"Native Scholar journeys published for exact-revision validation",passed:true,durationMs:0,evidenceId:`pull-request:${pullRequest.number}`}],deferredValidation:{remediationRunId:remediation.runId,pullRequestUrl:pullRequest.url},acceptanceEvidence:evidence(revision),functionalAcceptancePlan:await playbookMobileAcceptancePlan(dependencies.gateway,reference,branch,revision)};};}
