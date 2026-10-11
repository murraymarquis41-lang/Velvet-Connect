// Hosted Auth/JWT/Storage proof. Run ONLY after separate staging migration,
// bucket, retention, and cleanup activation approval. No real-member data.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";

const target="https://qqintbwoalvoegvqoxlo.supabase.co";
const results=[];
const report={sourceSha:process.env.ISSUE17_SOURCE_SHA || process.env.GITHUB_SHA || null,target,kind:"hosted authenticated synthetic QA",results};
const users=[]; const objects=[]; let admin; const clients={};
const output=process.env.ISSUE17_LIVE_REPORT || "/tmp/issue17-live-results.json";
async function rpc(client,name,args) { const {data,error}=await client.rpc(name,args); if(error) throw new Error(`${name} failed`); return data; }
async function test(name,fn) { await fn(); results.push({name,status:"PASS"}); console.log(`PASS ${name}`); }
async function noRows(client,table,field,value) { const {data,error}=await client.from(table).select("id").eq(field,value); assert.ifError(error); assert.equal(data.length,0); }
async function deniedRpc(client,name,args) { const {error}=await client.rpc(name,args); assert.ok(error,`${name} must reject`); }
let failed=false;
try {
  if (process.env.SUPABASE_URL!==target || process.env.ISSUE17_HOSTED_APPROVED!=="true") throw new Error("BLOCKED: separate hosted activation approval is required");
  if (!/^[0-9a-f]{40}$/.test(report.sourceSha || "")) throw new Error("BLOCKED: exact candidate source SHA required");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_PUBLISHABLE_KEY) throw new Error("BLOCKED: staging QA credentials unavailable");
  admin=createClient(target,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const preflight=await admin.from("moderation_evidence").select("id").limit(0);
  if(preflight.error) throw new Error("BLOCKED: approved issue17 staging migration is not installed");
  const stamp=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const password=`Synthetic-${stamp}-A9!`;
  for(const who of ["a","b","outsider","ceo","reviewer","mod"]) {
    clients[who]=createClient(target,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const email=`issue17-${stamp}-${who}@qqintbwoalvoegvqoxlo.supabase.co`;
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_e2e:true}});
    assert.ifError(error); users.push(data.user.id); clients[who].fixtureId=data.user.id;
    const login=await clients[who].auth.signInWithPassword({email,password}); assert.ifError(login.error);
    const profile=await clients[who].from("profiles").insert({id:data.user.id,display_name:`Synthetic ${who}`}); assert.ifError(profile.error);
    const setup=await admin.from("profiles").update({verified:true,onboarding_completed:true,date_of_birth:"1990-01-01",adult_attested_at:new Date().toISOString(),terms_accepted_at:new Date().toISOString()}).eq("id",data.user.id); assert.ifError(setup.error);
  }
  const id=who=>clients[who].fixtureId;
  const roles=await admin.from("moderator_roles").insert([{user_id:id("ceo"),role:"ceo"},{user_id:id("reviewer"),role:"safety_admin"},{user_id:id("mod"),role:"moderator"}]); assert.ifError(roles.error);
  const likesA=await clients.a.from("swipes").insert({actor_id:id("a"),target_id:id("b"),liked:true}); assert.ifError(likesA.error);
  const likesB=await clients.b.from("swipes").insert({actor_id:id("b"),target_id:id("a"),liked:true}); assert.ifError(likesB.error);
  const matches=await clients.a.from("matches").select("id"); assert.ifError(matches.error); assert.equal(matches.data.length,1); const matchId=matches.data[0].id;
  const makeReport=async(who,subject)=>{const {data,error}=await clients[who].from("reports").insert({reporter_id:id(who),reported_id:id(subject),reason:"synthetic issue17 QA",details:"Synthetic evidence only"}).select("id").single();assert.ifError(error);const c=await clients.ceo.from("moderation_cases").select("id").eq("report_id",data.id).single();assert.ifError(c.error);return c.data.id;};
  const caseId=await makeReport("a","b");
  await test("neutral case invitation, two parties, and unrelated-party denial",async()=>{
    assert.equal((await rpc(clients.b,"list_my_moderation_responses",{})).length,0);
    await deniedRpc(clients.b,"submit_moderation_case_statement",{target_case_id:caseId,member_statement:"Must reject before neutral invitation"});
    await rpc(clients.ceo,"moderate_case",{target_case_id:caseId,requested_action:"claimed",action_reason:"Synthetic claim",suspension_hours:1});
    await rpc(clients.ceo,"request_moderation_case_response",{target_case_id:caseId});
    const neutral=(await rpc(clients.b,"list_my_moderation_responses",{}))[0];
    assert.deepEqual(Object.keys(neutral).sort(),["case_id","case_status","member_side","may_submit","uploads_enabled"].sort());
    assert.equal(neutral.uploads_enabled,true,"Approved evidence activation required");
    for(const who of ["a","b"]) await rpc(clients[who],"submit_moderation_case_statement",{target_case_id:caseId,member_statement:`Synthetic independent ${who} statement`});
    await deniedRpc(clients.outsider,"submit_moderation_case_statement",{target_case_id:caseId,member_statement:"Unrelated member must not submit"});
    const before=await clients.a.from("moderation_case_statements").select("created_at,expires_at").eq("case_id",caseId).single();assert.ifError(before.error);
    await rpc(clients.a,"submit_moderation_case_statement",{target_case_id:caseId,member_statement:"Edited synthetic reporter statement"});
    const after=await clients.a.from("moderation_case_statements").select("created_at,expires_at").eq("case_id",caseId).single();assert.ifError(after.error);assert.deepEqual(after.data,before.data);
  });
  await test("statement isolation and active assigned moderator visibility",async()=>{
    for(const who of ["a","b"]) {const x=await clients[who].from("moderation_case_statements").select("author_id").eq("case_id",caseId);assert.ifError(x.error);assert.deepEqual(x.data.map(y=>y.author_id),[id(who)]);}
    for(const who of ["outsider","mod"]) await noRows(clients[who],"moderation_case_statements","case_id",caseId);
    const x=await clients.ceo.from("moderation_case_statements").select("id").eq("case_id",caseId);assert.ifError(x.error);assert.equal(x.data.length,2);
    const off=await admin.from("moderator_roles").update({active:false}).eq("user_id",id("ceo"));assert.ifError(off.error);
    await noRows(clients.ceo,"moderation_case_statements","case_id",caseId);
    const on=await admin.from("moderator_roles").update({active:true}).eq("user_id",id("ceo"));assert.ifError(on.error);
  });
  const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64");
  let evidence;
  await test("secure attachment author/case binding and authenticated downloads",async()=>{
    await deniedRpc(clients.outsider,"reserve_moderation_evidence",{target_case_id:caseId,evidence_mime:"image/png",evidence_size:bytes.length});
    await deniedRpc(clients.a,"reserve_moderation_evidence",{target_case_id:caseId,evidence_mime:"text/html",evidence_size:bytes.length});
    evidence=await rpc(clients.a,"reserve_moderation_evidence",{target_case_id:caseId,evidence_mime:"image/png",evidence_size:bytes.length});objects.push(evidence.object_path);
    const wrong=await clients.b.storage.from("moderation-evidence").upload(evidence.object_path,bytes,{contentType:"image/png"});assert.ok(wrong.error);
    const uploaded=await clients.a.storage.from("moderation-evidence").upload(evidence.object_path,bytes,{contentType:"image/png",upsert:false,cacheControl:"0"});assert.ifError(uploaded.error);
    await deniedRpc(clients.b,"finalize_moderation_evidence",{evidence_id:evidence.id});
    await rpc(clients.a,"finalize_moderation_evidence",{evidence_id:evidence.id});
    for(const who of ["b","outsider","mod"]) {const x=await clients[who].storage.from("moderation-evidence").download(evidence.object_path);assert.ok(x.error);}
    for(const who of ["a","ceo"]) {const x=await clients[who].storage.from("moderation-evidence").download(evidence.object_path);assert.ifError(x.error);assert.deepEqual(Buffer.from(await x.data.arrayBuffer()),bytes);}
    const signed=await clients.a.storage.from("moderation-evidence").createSignedUrl(evidence.object_path,60);assert.ok(signed.error,"Bearer signed links must be denied");
    const overwrite=await clients.a.storage.from("moderation-evidence").upload(evidence.object_path,bytes,{contentType:"image/png",upsert:true});assert.ok(overwrite.error);
  });
  await test("disconnect persists after statements/attachments and fresh JWT",async()=>{
    await clients.b.auth.refreshSession();
    await noRows(clients.a,"matches","id",matchId);
    const msg=await clients.b.from("messages").insert({match_id:matchId,sender_id:id("b"),body:"Must remain disconnected"});assert.ok(msg.error);
    const blocks=await clients.a.from("blocks").select("blocked_id").eq("blocked_id",id("b"));assert.ifError(blocks.error);assert.equal(blocks.data.length,1);
  });
  await test("appeal decision actor survives reassignment and unrelated sanction",async()=>{
    await rpc(clients.ceo,"moderate_case",{target_case_id:caseId,requested_action:"temporarily_suspended",action_reason:"Synthetic original decision",suspension_hours:1});
    const appealId=await rpc(clients.b,"submit_moderation_appeal",{target_case_id:caseId,appeal_statement:"Synthetic appeal of original temporary decision"});
    await rpc(clients.mod,"moderate_case",{target_case_id:caseId,requested_action:"escalated",action_reason:"Synthetic reassignment",suspension_hours:1});
    await deniedRpc(clients.ceo,"claim_moderation_appeal",{target_appeal_id:appealId});
    await deniedRpc(clients.ceo,"review_moderation_appeal",{target_appeal_id:appealId,decision:"overturned",decision_reason:"Must reject self review"});
    await rpc(clients.reviewer,"claim_moderation_appeal",{target_appeal_id:appealId});
    const other=await makeReport("outsider","b");
    await deniedRpc(clients.reviewer,"moderate_case",{target_case_id:other,requested_action:"permanently_suspended",action_reason:"CEO only",suspension_hours:1});
    await rpc(clients.ceo,"moderate_case",{target_case_id:other,requested_action:"permanently_suspended",action_reason:"Synthetic unrelated sanction",suspension_hours:1});
    await rpc(clients.reviewer,"review_moderation_appeal",{target_appeal_id:appealId,decision:"overturned",decision_reason:"Synthetic independent review"});
    const profile=await admin.from("profiles").select("safety_status").eq("id",id("b")).single();assert.ifError(profile.error);assert.equal(profile.data.safety_status,"permanently_suspended");
  });
  await test("expiration hides evidence before physical deletion",async()=>{
    const expired=await admin.from("moderation_evidence").update({expires_at:new Date(Date.now()-1000).toISOString()}).eq("id",evidence.id);assert.ifError(expired.error);
    const x=await clients.a.storage.from("moderation-evidence").download(evidence.object_path);assert.ok(x.error);
    await deniedRpc(clients.a,"list_moderation_evidence_purge",{});
    const due=await rpc(admin,"list_moderation_evidence_purge",{});assert.ok(due.some(x=>x.object_path===evidence.object_path));
    const removed=await admin.storage.from("moderation-evidence").remove([evidence.object_path]);assert.ifError(removed.error);
    await rpc(admin,"ack_moderation_evidence_purge",{purged_path:evidence.object_path});
    const physical=await admin.storage.from("moderation-evidence").download(evidence.object_path);assert.ok(physical.error);
  });
  await test("account deletion immediately hides evidence and queues byte deletion",async()=>{
    const c=await makeReport("a","outsider");
    const e=await rpc(clients.a,"reserve_moderation_evidence",{target_case_id:c,evidence_mime:"image/png",evidence_size:bytes.length});objects.push(e.object_path);
    const upload=await clients.a.storage.from("moderation-evidence").upload(e.object_path,bytes,{contentType:"image/png"});assert.ifError(upload.error);
    await rpc(clients.a,"finalize_moderation_evidence",{evidence_id:e.id});
    await rpc(clients.a,"delete_own_account",{confirmation:"DELETE"});
    const access=await clients.a.storage.from("moderation-evidence").download(e.object_path);assert.ok(access.error);
    const queue=await rpc(admin,"list_moderation_evidence_purge",{});assert.ok(queue.some(x=>x.object_path===e.object_path));
    const removed=await admin.storage.from("moderation-evidence").remove([e.object_path]);assert.ifError(removed.error);
    await rpc(admin,"ack_moderation_evidence_purge",{purged_path:e.object_path});
    const physical=await admin.storage.from("moderation-evidence").download(e.object_path);assert.ok(physical.error);
    users.splice(users.indexOf(id("a")),1);
  });
} catch(error) {failed=true;report.failure=error.message;console.error(error.message);}
finally {
  const cleanup=[];
  if(admin) {
    for(const path of objects) {const x=await admin.storage.from("moderation-evidence").remove([path]);if(x.error) cleanup.push("synthetic object cleanup failed");}
    for(const id of users.reverse()) {const x=await admin.auth.admin.deleteUser(id);if(x.error) cleanup.push("synthetic account cleanup failed");}
    for(const client of Object.values(clients)) await client.auth.signOut();
  }
  report.cleanup=cleanup.length ? cleanup : [admin ? "synthetic account/object cleanup completed; queued paths remain retryable for one hour" : "no synthetic data created"];
  report.status=failed || cleanup.length ? "BLOCKED_OR_FAILED" : "PASS";
  await writeFile(output,JSON.stringify(report,null,2));
  if(failed || cleanup.length) process.exitCode=1;
}
