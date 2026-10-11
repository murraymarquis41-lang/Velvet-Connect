// Local PostgreSQL role/RLS tests. Auth/Storage service fixtures are deliberately
// minimal; this is SQL proof, not hosted JWT/Storage API or browser certification.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const results = [];
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage; create schema extensions;
create table auth.users(id uuid primary key); create table auth.sessions(user_id uuid);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$select current_setting('storage.operation',true)=any(operations)$$;
select set_config('storage.operation','object.get_authenticated',false);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
`);
for (const name of (await readdir("supabase/migrations")).filter(x => x.endsWith(".sql")).sort()) {
  await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
}
await db.exec("grant usage on schema private to authenticated,service_role;");
const ids = Object.fromEntries(["a","b","outsider","ceo","reviewer","otherMod"].map((name,i) => [name, `00000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`]));
for (const [name,id] of Object.entries(ids)) {
  await db.query("insert into auth.users values($1);", [id]);
  await db.query("insert into public.profiles(id,display_name,verified) values($1,$2,true)", [id,name]);
}
await db.exec(`insert into public.moderator_roles(user_id,role) values('${ids.ceo}','ceo'),('${ids.reviewer}','safety_admin'),('${ids.otherMod}','moderator');`);
async function as(member,sql,params=[]) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${ids[member]}',false);`);
  try { return (await db.query(sql,params)).rows; }
  finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)"); }
}
async function denied(member,sql,params=[]) { await assert.rejects(() => as(member,sql,params)); }
async function test(name,fn) { await fn(); results.push({name,status:"PASS"}); console.log(`PASS ${name}`); }
let report,caseId,evidence,appeal;
await test("report disconnect and private report", async()=> {
  const match=(await db.query("insert into public.matches(user_a_id,user_b_id) values($1,$2) returning id",[ids.a,ids.b])).rows[0].id;
  report=(await as("a","insert into public.reports(reporter_id,reported_id,reason) values($1,$2,'synthetic') returning id",[ids.a,ids.b]))[0].id;
  caseId=(await db.query("select id from public.moderation_cases where report_id=$1",[report])).rows[0].id;
  assert.equal((await as("b","select id from public.reports where id=$1",[report])).length,0);
  assert.equal((await as("a","select id from public.matches where id=$1",[match])).length,0);
  await denied("b","insert into public.messages(match_id,sender_id,body) values($1,$2,'must fail')",[match,ids.b]);
});
await test("neutral response invitation and party authorization",async()=> {
  assert.equal((await as("b","select * from public.list_my_moderation_responses()")).length,0);
  await denied("b","select public.submit_moderation_case_statement($1,'synthetic member response')",[caseId]);
  await as("ceo","select public.moderate_case($1,'claimed','Synthetic claim',72)",[caseId]);
  await as("ceo","select public.request_moderation_case_response($1)",[caseId]);
  const neutral=(await as("b","select * from public.list_my_moderation_responses()"))[0];
  assert.deepEqual(Object.keys(neutral).sort(),["case_id","case_status","member_side","may_submit","uploads_enabled"].sort());
  await as("a","select public.submit_moderation_case_statement($1,'Synthetic reporter statement')",[caseId]);
  await as("b","select public.submit_moderation_case_statement($1,'Synthetic member independent statement')",[caseId]);
  await denied("outsider","select public.submit_moderation_case_statement($1,'Unrelated member must fail')",[caseId]);
  await denied("a","insert into public.moderation_case_statements(case_id,author_id,author_side,statement,expires_at) values($1,$2,'reporter','direct write must fail',now()+interval '1 day')",[caseId,ids.a]);
});
await test("two-sided isolation and assigned moderator visibility",async()=> {
  assert.equal((await as("a","select * from public.moderation_case_statements where case_id=$1",[caseId])).length,1);
  assert.equal((await as("b","select * from public.moderation_case_statements where case_id=$1",[caseId])).length,1);
  assert.equal((await as("outsider","select * from public.moderation_case_statements where case_id=$1",[caseId])).length,0);
  assert.equal((await as("otherMod","select * from public.moderation_case_statements where case_id=$1",[caseId])).length,0);
  assert.equal((await as("ceo","select * from public.moderation_case_statements where case_id=$1",[caseId])).length,2);
  await db.query("update public.moderator_roles set active=false where user_id=$1",[ids.ceo]);
  assert.equal((await as("ceo","select * from public.moderation_case_statements where case_id=$1",[caseId])).length,0);
  await db.query("update public.moderator_roles set active=true where user_id=$1",[ids.ceo]);
});
await test("evidence activation, type/size/party boundaries",async()=> {
  await denied("a","select public.reserve_moderation_evidence($1,'image/png',64)",[caseId]);
  await db.exec("update private.evidence_policy set uploads_enabled=true");
  await denied("outsider","select public.reserve_moderation_evidence($1,'image/png',64)",[caseId]);
  await denied("a","select public.reserve_moderation_evidence($1,'text/html',64)",[caseId]);
  await denied("a","select public.reserve_moderation_evidence($1,'image/png',5242881)",[caseId]);
  evidence=(await as("a","select * from public.reserve_moderation_evidence($1,'image/png',64)",[caseId]))[0];
  await denied("b","insert into storage.objects(bucket_id,name,metadata) values('moderation-evidence',$1,'{}')",[evidence.object_path]);
  await as("a","insert into storage.objects(bucket_id,name,metadata) values('moderation-evidence',$1,'{\"mimetype\":\"image/png\",\"size\":64}')",[evidence.object_path]);
  await denied("b","select public.finalize_moderation_evidence($1)",[evidence.id]);
  await as("a","select public.finalize_moderation_evidence($1)",[evidence.id]);
});
await test("evidence read isolation and no overwrite",async()=> {
  for (const who of ["b","outsider","otherMod"]) assert.equal((await as(who,"select * from storage.objects where name=$1",[evidence.object_path])).length,0);
  assert.equal((await as("a","select * from storage.objects where name=$1",[evidence.object_path])).length,1);
  assert.equal((await as("ceo","select * from storage.objects where name=$1",[evidence.object_path])).length,1);
  assert.equal((await as("a","update storage.objects set metadata='{}' where name=$1 returning *",[evidence.object_path])).length,0);
});
await test("signed links and anonymous RPC access denied",async()=> {
  await db.exec("select set_config('storage.operation','object.sign',false)");
  assert.equal((await as("a","select * from storage.objects where name=$1",[evidence.object_path])).length,0);
  await db.exec("select set_config('storage.operation','object.get_authenticated',false); set role anon;");
  try { await assert.rejects(()=>db.query("select public.reserve_moderation_evidence($1,'image/png',64)",[caseId])); }
  finally { await db.exec("reset role;"); }
});
await test("random and cross-case object keys rejected",async()=> {
  await denied("a","insert into storage.objects(bucket_id,name,metadata) values('moderation-evidence','another-case/random','{}')");
  await denied("a","select public.reserve_moderation_evidence('11111111-1111-4111-8111-111111111111','image/png',64)");
});
await test("retention cannot be extended by statement edits",async()=> {
  const before=(await db.query("select expires_at,created_at from public.moderation_case_statements where author_id=$1",[ids.a])).rows[0];
  await as("a","select public.submit_moderation_case_statement($1,'Edited synthetic reporter statement')",[caseId]);
  const after=(await db.query("select expires_at,created_at from public.moderation_case_statements where author_id=$1",[ids.a])).rows[0];
  assert.deepEqual(after,before);
});
await test("disconnect persists through statement and evidence flow",async()=> {
  assert.equal((await as("a","select * from public.matches")).length,0);
  assert.equal((await as("a","select * from public.blocks where blocked_id=$1",[ids.b])).length,1);
});
await test("decision-actor independence survives reassignment",async()=> {
  await as("ceo","select public.moderate_case($1,'temporarily_suspended','Synthetic sanction',1)",[caseId]);
  appeal=(await as("b","select public.submit_moderation_appeal($1,'Synthetic appeal of original decision')",[caseId]))[0].submit_moderation_appeal;
  await as("otherMod","select public.moderate_case($1,'escalated','Synthetic reassignment',72)",[caseId]);
  await denied("ceo","select public.claim_moderation_appeal($1)",[appeal]);
  await denied("ceo","select public.review_moderation_appeal($1,'overturned','Self review prohibited')",[appeal]);
  await denied("outsider","select public.claim_moderation_appeal($1)",[appeal]);
  await as("reviewer","select public.claim_moderation_appeal($1)",[appeal]);
  assert.equal((await as("reviewer","select * from public.moderation_case_statements where case_id=$1",[caseId])).length,2);
});
await test("unrelated CEO permanent sanction survives appeal overturn",async()=> {
  const otherReport=(await as("outsider","insert into public.reports(reporter_id,reported_id,reason) values($1,$2,'synthetic other case') returning id",[ids.outsider,ids.b]))[0].id;
  const otherCase=(await db.query("select id from public.moderation_cases where report_id=$1",[otherReport])).rows[0].id;
  await denied("reviewer","select public.moderate_case($1,'permanently_suspended','Must be CEO',72)",[otherCase]);
  await as("ceo","select public.moderate_case($1,'permanently_suspended','Synthetic other permanent sanction',72)",[otherCase]);
  await as("reviewer","select public.review_moderation_appeal($1,'overturned','Independent synthetic review')",[appeal]);
  assert.equal((await db.query("select safety_status from public.profiles where id=$1",[ids.b])).rows[0].safety_status,"permanently_suspended");
  await denied("a","select public.submit_moderation_case_statement($1,'Closed case must reject statement')",[caseId]);
});
await test("immutable audit and capped per-party attachments",async()=> {
  await assert.rejects(()=>db.exec("update public.moderation_actions set reason='audit mutation must fail'"));
  // Create another open case for quota testing; six reservations must not succeed.
  const r=(await as("outsider","insert into public.reports(reporter_id,reported_id,reason) values($1,$2,'quota fixture') returning id",[ids.outsider,ids.a]))[0].id;
  const c=(await db.query("select id from public.moderation_cases where report_id=$1",[r])).rows[0].id;
  for(let i=0;i<5;i++) await as("outsider","select * from public.reserve_moderation_evidence($1,'image/png',64)",[c]);
  await denied("outsider","select * from public.reserve_moderation_evidence($1,'image/png',64)",[c]);
});
await test("expired material hidden and member cannot purge",async()=> {
  await db.query("update public.moderation_evidence set expires_at=now()-interval '1 second' where id=$1",[evidence.id]);
  await db.exec("update public.moderation_case_statements set expires_at=now()-interval '1 second'");
  assert.equal((await as("a","select * from storage.objects where name=$1",[evidence.object_path])).length,0);
  assert.equal((await as("otherMod","select * from public.moderation_case_statements")).length,0);
  await denied("a","select * from public.list_moderation_evidence_purge()");
  assert.equal((await db.query("select * from public.list_moderation_evidence_purge()")).rows.length,1);
  await db.query("select public.ack_moderation_evidence_purge($1)",[evidence.object_path]);
  await db.exec("select public.purge_expired_moderation_statements()");
  assert.equal((await db.query("select * from public.moderation_case_statements")).rows.length,0);
});
await test("account deletion queues object bytes independently of metadata",async()=> {
  // Independent case permits another synthetic reservation before deleting its author.
  const report2=(await as("a","insert into public.reports(reporter_id,reported_id,reason) values($1,$2,'deletion fixture') returning id",[ids.a,ids.outsider]))[0].id;
  const case2=(await db.query("select id from public.moderation_cases where report_id=$1",[report2])).rows[0].id;
  const item=(await as("a","select * from public.reserve_moderation_evidence($1,'image/png',64)",[case2]))[0];
  await as("a","select public.delete_own_account('DELETE')");
  assert.equal((await db.query("select * from public.moderation_evidence where id=$1",[item.id])).rows.length,0);
  assert.equal((await db.query("select * from private.evidence_deletion_queue where object_path=$1",[item.object_path])).rows.length,1);
});
await writeFile(process.env.ISSUE17_SQL_REPORT || "/tmp/issue17-sql-results.json",JSON.stringify({sourceSha:process.env.ISSUE17_SOURCE_SHA || process.env.GITHUB_SHA || null,runtime:(await db.query("select version()")).rows[0].version,kind:"local SQL fixtures; not authenticated hosted service proof",results},null,2));
await db.close();
console.log(`PASS ${results.length} local SQL scenarios`);
