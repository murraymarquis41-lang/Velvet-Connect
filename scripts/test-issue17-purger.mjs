import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeEvidence } from "./issue17-purge-lib.mjs";
function fixture({storageFails=false,metadataFails=false}={}) {
  const ack=[];const bytes=new Set(["case/due","case/orphan","case/live"]);
  return {ack,bytes,client:{
    rpc:async(name,args)=>name==="list_moderation_evidence_purge" ? {data:[{object_path:"case/due"}]} : (name==="ack_moderation_evidence_purge" ? (ack.push(args.purged_path),{}) : {}),
    storage:{from:()=>({
      remove:async(paths)=>storageFails ? {error: new Error("test failure")} : (paths.forEach(p=>bytes.delete(p)),{}),
      list:async(prefix)=>({data:prefix ? [...bytes].filter(p=>p.startsWith(prefix+"/")).map(p=>({name:p.split("/")[1],id:"fixture-id"})) : [{name:"case",id:null}]}),
    })},
    from:()=>({select:()=>({eq:(_,path)=>({maybeSingle:async()=>metadataFails ? {error:new Error("test failure")} : {data:path==="case/live" ? {id:"live"} : null}})})}),
  }};
}
test("purger removes due and orphan bytes, preserves live evidence, acknowledges after API removal",async()=>{
  const x=fixture();const result=await purgeEvidence(x.client);
  assert.deepEqual([...x.bytes],["case/live"]);assert.deepEqual(x.ack,["case/due","case/orphan"]);assert.equal(result.removed,2);
});
test("failed physical deletion never acknowledges metadata",async()=>{
  const x=fixture({storageFails:true});await assert.rejects(()=>purgeEvidence(x.client),/Physical/);assert.equal(x.ack.length,0);assert.equal(x.bytes.size,3);
});
test("metadata lookup failure preserves suspected orphan",async()=>{
  const x=fixture({metadataFails:true});await assert.rejects(()=>purgeEvidence(x.client),/metadata verification/);assert.ok(x.bytes.has("case/orphan"));assert.ok(x.bytes.has("case/live"));
});
