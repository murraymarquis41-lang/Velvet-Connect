import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth, collectMetrics } from "./issue17-purge-health-lib.mjs";
const ok={queueCount:0,queueOldestAgeSeconds:null,overdueCount:0,deletionRequestedCount:0,objectCount:1,orphanCount:0};
test("empty backlog passes",()=>{assert.equal(evaluateHealth(ok).result,"PASS");});
test("queue row exactly 2h passes, over 2h fails",()=>{
  assert.equal(evaluateHealth({...ok,queueCount:1,queueOldestAgeSeconds:7200}).result,"PASS");
  const r=evaluateHealth({...ok,queueCount:1,queueOldestAgeSeconds:7201});
  assert.equal(r.result,"FAIL");assert.deepEqual(r.failures,["queue_row_older_than_2h"]);
});
test("any item overdue past 1h fails",()=>{assert.deepEqual(evaluateHealth({...ok,overdueCount:1}).failures,["purge_item_overdue_over_1h"]);});
test("orphan objects fail",()=>{assert.deepEqual(evaluateHealth({...ok,orphanCount:2}).failures,["orphan_objects_present"]);});
test("multiple failures are all reported",()=>{assert.equal(evaluateHealth({...ok,queueOldestAgeSeconds:9999,overdueCount:3,orphanCount:1}).failures.length,3);});
function client({statsFails=false}={}) {
  const files=new Set(["case/live","case/orphan"]);
  return {
    rpc:async()=>statsFails ? {error:new Error("x")} : {data:[{queue_count:2,queue_oldest_age_seconds:60,overdue_count:0,deletion_requested_count:1}]},
    storage:{from:()=>({list:async(prefix)=>({data:prefix ? [...files].map(p=>({name:p.split("/")[1],id:"i"})) : [{name:"case",id:null}]}),remove:async()=>{throw new Error("health check must never delete");}})},
    from:()=>({select:()=>({eq:(_,p)=>({maybeSingle:async()=>({data:p==="case/live" ? {id:"1"} : null})})})}),
  };
}
test("collects metrics read-only and counts orphans",async()=>{
  const m=await collectMetrics(client());
  assert.deepEqual(m,{queueCount:2,queueOldestAgeSeconds:60,overdueCount:0,deletionRequestedCount:1,objectCount:2,orphanCount:1});
});
test("stats failure is an error, never a PASS",async()=>{await assert.rejects(collectMetrics(client({statsFails:true})));});
