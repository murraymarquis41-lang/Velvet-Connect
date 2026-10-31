// Read-only backlog health for the private staging purge worker. Never deletes.
const bucket="moderation-evidence";
export const thresholds={queueMaxAgeSeconds:2*60*60,overdueMax:0,orphanMax:0};

export function evaluateHealth(m,t=thresholds) {
  const failures=[];
  if((m.queueOldestAgeSeconds??0)>t.queueMaxAgeSeconds) failures.push("queue_row_older_than_2h");
  if(m.overdueCount>t.overdueMax) failures.push("purge_item_overdue_over_1h");
  if(m.orphanCount>t.orphanMax) failures.push("orphan_objects_present");
  return {result:failures.length ? "FAIL" : "PASS",failures,metrics:m};
}

async function listAll(client,prefix) {
  const items=[];
  for(let offset=0;;offset+=100) {
    const {data,error}=await client.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
    if(error) throw new Error("Evidence listing failed; health unknown.");
    items.push(...data);
    if(data.length<100) return items;
  }
}

export async function collectMetrics(client) {
  const {data,error}=await client.rpc("moderation_evidence_purge_stats");
  if(error) throw new Error("Purge stats unavailable; health unknown.");
  const row=(Array.isArray(data) ? data[0] : data) ?? {};
  let orphanCount=0,objectCount=0;
  for(const folder of await listAll(client,"")) {
    if(folder.id) { orphanCount++; objectCount++; continue; }
    for(const file of await listAll(client,folder.name)) {
      if(!file.id) continue;
      objectCount++;
      const r=await client.from("moderation_evidence").select("id").eq("object_path",`${folder.name}/${file.name}`).maybeSingle();
      if(r.error) throw new Error("Evidence metadata verification failed; health unknown.");
      if(!r.data) orphanCount++;
    }
  }
  return {
    queueCount:Number(row.queue_count ?? 0),
    queueOldestAgeSeconds:row.queue_oldest_age_seconds==null ? null : Number(row.queue_oldest_age_seconds),
    overdueCount:Number(row.overdue_count ?? 0),
    deletionRequestedCount:Number(row.deletion_requested_count ?? 0),
    objectCount,orphanCount,
  };
}
