const { PGlite } = await import(process.env.ISSUE10_PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs';
import path from 'node:path';
const source=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const root=path.resolve(process.argv[2] || '/tmp/velvet-issue10-replay');
if(root===source || root.startsWith(source+path.sep)) throw Error('Evidence output must be outside repository');
fs.mkdirSync(root,{recursive:true});
const log=[];
const record=(x)=>{log.push({at:new Date().toISOString(),...x});fs.writeFileSync(path.join(root,'replay-results.json'),JSON.stringify(log,null,2));console.log(JSON.stringify(x));};
const db=new PGlite();
record({type:'environment',node:process.version,pglite:'0.5.8',postgres:(await db.query('select version() as version')).rows[0].version,scope:'PostgreSQL compatibility replay; minimal Auth prerequisite stand-ins, reduced Storage tables for SQL policies, no Supabase Auth/Storage/API services. No application objects pre-created. Not full Supabase certification.'});
const prerequisites=fs.readFileSync(path.join(source,'scripts/issue10/platform-fixtures.sql'),'utf8');
fs.writeFileSync(path.join(root,'platform-test-prerequisites.sql'),prerequisites);
await db.exec(prerequisites);
record({type:'platform_prerequisites',status:'APPLIED',source:'auth.uid() definition copied from authoritative staging; Auth tables reduced to fields used by app. Storage-policy fixture DML grants declared; no broad public default grants added.'});
for(const name of fs.readdirSync(path.join(source,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()){
 try{await db.exec(fs.readFileSync(path.join(source,'supabase/migrations',name),'utf8'));record({type:'migration',name,status:'PASS'});}catch(e){record({type:'migration',name,status:'FAIL',message:e.message,code:e.code});await db.close();process.exit(1);}
}
const catalogSql=fs.readFileSync(path.join(source,'scripts/issue10/catalog-query.sql'),'utf8');
const catalog=(await db.query(catalogSql)).rows[0].catalog;
fs.writeFileSync(path.join(root,'reconstructed-catalog.json'),JSON.stringify(catalog,null,2));
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',C='10000000-0000-4000-8000-000000000003',CEO='10000000-0000-4000-8000-000000000004';
await db.exec(`insert into auth.users(id) values ('${A}'),('${B}'),('${C}'),('${CEO}');
insert into public.profiles(id,display_name,age,date_of_birth,adult_attested_at,terms_accepted_at,verified,onboarding_completed) values
('${A}','Synthetic A',30,'1990-01-01',now(),now(),true,true),('${B}','Synthetic B',30,'1990-01-01',now(),now(),true,true),('${C}','Synthetic C',30,'1990-01-01',now(),now(),false,false),('${CEO}','Synthetic CEO',30,'1990-01-01',now(),now(),true,true);
insert into public.moderator_roles(user_id,role) values ('${CEO}','ceo');`);
async function test(id,role,user,sql,expected,check){
 await db.exec('begin');
 try{await db.exec(`set local role ${role}; select set_config('request.jwt.claims','${JSON.stringify({sub:user,role})}',true);`);
 const result=await db.query(sql);const ok=expected==='success' && (!check||check(result.rows));record({type:'test',id,status:ok?'PASS':'FAIL',role,sql,expected,rows:result.rows});await db.exec('commit');
 }catch(e){record({type:'test',id,status:expected==='denied' && ['42501','P0001','23514'].includes(e.code)?'PASS':'FAIL',role,sql,expected,message:e.message,code:e.code});await db.exec('rollback');}
}
async function storageTests(){
 const photo=`${B}/synthetic.webp`;
 await db.exec(`delete from public.blocks; insert into public.profile_photos(profile_id,storage_path,position) values ('${B}','${photo}',0);`);
 await test('STORAGE-OWN-UPLOAD','authenticated',B,`insert into storage.objects(bucket_id,name) values ('profile-photos','${photo}') returning id`,'success',r=>r.length===1);
 await test('STORAGE-CROSS-UPLOAD-DENIED','authenticated',A,`insert into storage.objects(bucket_id,name) values ('profile-photos','${B}/foreign.webp')`,'denied');
 await test('STORAGE-ANON-DENIED','anon',null,'select * from storage.objects','denied');
 await test('STORAGE-ELIGIBLE-READ','authenticated',A,`select * from storage.objects where name='${photo}'`,'success',r=>r.length===1);
 await test('STORAGE-UNVERIFIED-HIDDEN','authenticated',C,'select * from storage.objects','success',r=>r.length===0);
 await test('STORAGE-CROSS-DELETE-NO-ROWS','authenticated',A,`delete from storage.objects where name='${photo}' returning id`,'success',r=>r.length===0);
 await test('STORAGE-CROSS-UPDATE-NO-ROWS','authenticated',A,`update storage.objects set name='${A}/stolen.webp' where name='${photo}' returning id`,'success',r=>r.length===0);
 await test('STORAGE-OWN-REASSIGN-DENIED','authenticated',B,`update storage.objects set name='${A}/stolen.webp' where name='${photo}'`,'denied');
 await db.exec(`insert into public.blocks(blocker_id,blocked_id) values ('${A}','${B}');`);
 await test('STORAGE-BLOCK-HIDDEN','authenticated',A,'select * from storage.objects','success',r=>r.length===0);
 await test('STORAGE-OWNER-AFTER-BLOCK','authenticated',B,'select * from storage.objects','success',r=>r.length===1);
 await test('STORAGE-OWN-DELETE','authenticated',B,`delete from storage.objects where name='${photo}' returning id`,'success',r=>r.length===1);
 const bucket=(await db.query("select * from storage.buckets where id='profile-photos'")).rows[0];
 record({type:'assertion',id:'STORAGE-BUCKET-PRIVATE-LIMITS',status:bucket?.public===false && Number(bucket.file_size_limit)===8388608 && bucket.allowed_mime_types.length===5?'PASS':'FAIL',rows:[bucket]});
 record({type:'assertion',id:'SWIPE-TRIGGER-UPDATE-OF-LIKED',status:(await db.query("select pg_get_triggerdef(oid) as definition from pg_trigger where tgname='swipes_create_match_on_mutual_like'")).rows[0].definition.includes('UPDATE OF liked')?'PASS':'FAIL'});
 const internal=(await db.query("select has_function_privilege('authenticated','private.members_are_blocked(uuid,uuid)','EXECUTE') as member,has_function_privilege('anon','private.members_are_blocked(uuid,uuid)','EXECUTE') as anon,has_function_privilege('authenticated','private.create_match_on_mutual_like()','EXECUTE') as trigger_member,has_schema_privilege('authenticated','private','USAGE') as private_usage")).rows[0];
 record({type:'assertion',id:'PRIVATE-APPLICATION-ACL',status:!internal.member&&!internal.anon&&!internal.trigger_member&&internal.private_usage?'PASS':'FAIL',rows:[internal]});
}
await test('PROFILE-OWN-READ','authenticated',A,`select id from public.profiles where id='${A}'`,'success',r=>r.length===1);
await test('DISCOVERY-ELIGIBLE','authenticated',A,`select id from public.profiles where id='${B}'`,'success',r=>r.length===1);
await test('VERIFICATION-ESCALATION','authenticated',C,`update public.profiles set verified=true where id='${C}'`,'denied');
await test('ANON-PROFILE-DENIED','anon',null,'select * from public.profiles','denied');
await test('ONE-SIDED-LIKE','authenticated',A,`insert into public.swipes(actor_id,target_id,liked) values ('${A}','${B}',true)`,'success');
record({type:'assertion',id:'ONE-SIDED-NO-MATCH',status:(await db.query('select * from public.matches')).rows.length===0?'PASS':'FAIL'});
await test('RECIPROCAL-LIKE','authenticated',B,`insert into public.swipes(actor_id,target_id,liked) values ('${B}','${A}',true)`,'success');
record({type:'assertion',id:'RECIPROCAL-MATCH',status:(await db.query('select * from public.matches')).rows.length===1?'PASS':'FAIL'});
await test('DIRECT-MATCH-INSERT','authenticated',A,`insert into public.matches(user_a_id,user_b_id) values ('${A}','${B}')`,'denied');
await test('MESSAGE-SEND','authenticated',A,`insert into public.messages(match_id,sender_id,body) select id,'${A}','Synthetic message' from public.matches returning id`,'success',r=>r.length===1);
await test('MESSAGE-READ-AT','authenticated',B,`update public.messages set read_at=now() returning id`,'success',r=>r.length===1);
await test('MESSAGE-BODY-UPDATE','authenticated',B,`update public.messages set body='Changed'`,'denied');
await test('BLOCK-INSERT','authenticated',A,`insert into public.blocks(blocker_id,blocked_id) values ('${A}','${B}')`,'success');
await test('BLOCK-HIDES-MATCH','authenticated',B,'select * from public.matches','success',r=>r.length===0);
const matchId=(await db.query('select id from public.matches')).rows[0]?.id;
await test('POST-BLOCK-MESSAGE-DENIED','authenticated',B,`insert into public.messages(match_id,sender_id,body) values ('${matchId}','${B}','After block')`,'denied');
await test('THIRD-MEMBER-MESSAGE-HIDDEN','authenticated',C,'select * from public.messages','success',r=>r.length===0);
await test('UNDERAGE-ONBOARDING-DENIED','authenticated',C,`update public.profiles set onboarding_completed=true,date_of_birth=current_date-interval '17 years',adult_attested_at=now(),terms_accepted_at=now() where id='${C}'`,'denied');
await test('REPORT-QUEUE','authenticated',A,`insert into public.reports(reporter_id,reported_id,reason) values ('${A}','${B}','coercion') returning id`,'success',r=>r.length===1);
record({type:'assertion',id:'COERCION-CRITICAL-TRIAGE',expected:'critical per authoritative staging migration',rows:(await db.query('select severity from public.moderation_cases')).rows,status:(await db.query("select * from public.moderation_cases where severity='critical'")).rows.length===1?'PASS':'FAIL'});
await test('SEXUAL-IMAGE-ABUSE-REPORT','authenticated',A,`insert into public.reports(reporter_id,reported_id,reason) values ('${A}','${B}','sexual image abuse') returning id`,'success',r=>r.length===1);
record({type:'assertion',id:'SEXUAL-IMAGE-ABUSE-CRITICAL-TRIAGE',expected:'critical per authoritative staging migration',rows:(await db.query("select c.severity from public.moderation_cases c join public.reports r on r.id=c.report_id where r.reason='sexual image abuse'")).rows,status:(await db.query("select c.id from public.moderation_cases c join public.reports r on r.id=c.report_id where r.reason='sexual image abuse' and c.severity='critical'")).rows.length===1?'PASS':'FAIL'});
await test('ROLE-SELF-ELEVATION','authenticated',A,`insert into public.moderator_roles(user_id,role) values ('${A}','ceo')`,'denied');
await test('CEO-DIAGNOSTICS','authenticated',CEO,'select public.admin_diagnostics()','success',r=>r.length===1);
await test('MEMBER-DIAGNOSTICS-DENIED','authenticated',A,'select public.admin_diagnostics()','denied');
await test('ANON-DIAGNOSTICS-DENIED','anon',null,'select public.admin_diagnostics()','denied');
await storageTests();
const privileges=(await db.query("select n.nspname,c.relname,r.rolname,has_table_privilege(r.rolname,c.oid,'TRUNCATE') as truncate,has_table_privilege(r.rolname,c.oid,'TRIGGER') as trigger,has_table_privilege(r.rolname,c.oid,'REFERENCES') as references from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join pg_roles r where n.nspname='public' and c.relkind='r' and r.rolname in ('anon','authenticated') order by c.relname,r.rolname")).rows;
record({type:'privileges',rows:privileges});
await db.close();
const failures=log.filter(x=>x.status==='FAIL');
record({type:'complete',fullSupabaseReconstruction:'NOT RUN',migrationReplay:'PASS',sampledChecks:failures.length?'FAIL':'PASS',runtimeScope:'isolated PostgreSQL policy compatibility only; exact failures retained'});
if(failures.length) process.exitCode=1;
