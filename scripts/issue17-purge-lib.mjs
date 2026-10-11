// Only the private staging worker uses this module. Never run with a member key.
const bucket="moderation-evidence";
async function listAll(client,prefix) {
  const items=[];
  for(let offset=0;;offset+=100) {
    const {data,error}=await client.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
    if(error) throw new Error("Evidence orphan scan failed; no deletion based on incomplete listing.");
    items.push(...data);
    if(data.length<100) return items;
  }
}
async function removeAndAck(client,path) {
  const {error}=await client.storage.from(bucket).remove([path]);
  if(error) throw new Error("Physical evidence deletion failed; queue retained for retry.");
  const ack=await client.rpc("ack_moderation_evidence_purge",{purged_path:path});
  if(ack.error) throw new Error("Evidence deletion acknowledgment failed; retry required.");
}
export async function purgeEvidence(client) {
  const {data,error}=await client.rpc("list_moderation_evidence_purge");
  if(error) throw new Error("Evidence purge queue could not be read.");
  let removed=0;
  for(const item of data ?? []) { await removeAndAck(client,item.object_path); removed++; }
  // Sweep orphan bytes as well as queued metadata. This catches uploads that
  // finish after an account/case deletion and after the queue retry window.
  // Complete each directory listing before deleting, avoiding offset shifts.
  for(const folder of await listAll(client,"")) {
    if(folder.id) throw new Error("Unexpected evidence root object requires operator review.");
    for(const file of await listAll(client,folder.name)) {
      if(!file.id) throw new Error("Unexpected nested evidence directory requires operator review.");
      const path=`${folder.name}/${file.name}`;
      const row=await client.from("moderation_evidence").select("id").eq("object_path",path).maybeSingle();
      if(row.error) throw new Error("Evidence metadata verification failed; orphan not deleted.");
      if(!row.data) { await removeAndAck(client,path); removed++; }
    }
  }
  const expired=await client.rpc("purge_expired_moderation_statements");
  if(expired.error) throw new Error("Expired statement purge failed.");
  return {result:"PASS",removed,expiredStatementsPurged:true};
}
