
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { salonWorkflow, salonCommand, getSalon } from '../src/workflows';
import type { Opening, SalonState } from '../src/types';
import * as activities from '../src/activities';
test('durable salon: ordered offers, reservation, decline, timeout, failure recovery, cancellation and atomic acceptance',async()=>{
 const env=await TestWorkflowEnvironment.createTimeSkipping();
 try {
  const worker=await Worker.create({connection:env.nativeConnection,taskQueue:'salon-test',workflowsPath:require.resolve('../src/workflows'),activities});
  await worker.runUntil(async()=>{
   const h=await env.client.workflow.start(salonWorkflow,{workflowId:'salon-test',taskQueue:'salon-test'});
   const state=()=>h.query(getSalon);
   const update=(action:any,openingId:string,offerId?:string,manual?:boolean)=>h.executeUpdate(salonCommand,{args:[{action,openingId,offerId,manual}]});
   async function until(check:(s:SalonState)=>boolean){for(let i=0;i<100;i++){const s=await state();if(check(s))return s;await new Promise(r=>setTimeout(r,20));}throw Error('State did not settle');}
   let day=7;
   async function create(id:string,failNext=false){const now=await env.currentTimeMs();const date=new Date(now+day++*86400000).toISOString().slice(0,10);const opening:Opening={id,service:'Color',stylist:'Lena',startsAt:date+'T14:00:00-07:00',duration:90,responseMinutes:15,demo:true,failNext,status:'searching',offers:[],history:[]};await h.executeUpdate(salonCommand,{args:[{action:'create',openingId:id,opening}]});}
   await create('a');let s=await until(s=>s.openings[0]?.offers[0]?.status==='waiting');
   assert.equal(s.openings[0].offers[0].clientId,'ava');
   await create('b');s=await until(s=>s.openings[1]?.offers[0]?.status==='waiting');
   assert.equal(s.openings[1].offers[0].clientId,'mia','active clients are reserved across openings');
   const a=s.openings[0].offers[0];await update('decline','a',a.id);
   s=await until(s=>s.openings[0].offers[1]?.status==='waiting');
   assert.equal(s.openings[0].offers[1].clientId,'zoe');
   assert.equal((await update('accept','a',a.id)).ok,false,'old link cannot claim');
   const winner=s.openings[0].offers[1];
   const results=await Promise.all([update('accept','a',winner.id),update('stop','a')]);
   assert.equal(results.filter(r=>r.ok).length,1,'only one closure wins');
   s=await state();
   if(s.openings[0].status==='filled'){assert(s.clients.find(c=>c.id==='zoe')?.booked);assert.equal((await update('accept','a',winner.id)).ok,true,'acceptance is idempotent');}
   await update('stop','b');assert.equal((await update('accept','b',s.openings[1].offers[0].id)).ok,false);
   await create('failure',true);s=await until(s=>s.openings[2]?.status==='paused');
   const failed=s.openings[2].offers[0];assert.equal(failed.deadline,undefined);
   assert.equal((await update('accept','failure',failed.id)).ok,false);
   await update('retry','failure',failed.id);s=await until(s=>s.openings[2].offers[0].status==='waiting');assert(s.openings[2].offers[0].deadline);
   await env.sleep('21 seconds');s=await until(s=>s.openings[2].offers[0].status==='expired');
   assert.equal((await update('accept','failure',failed.id)).ok,false,'expired reply rejected');
   await update('stop','failure');
   await create('manual',true);s=await until(s=>s.openings[3]?.status==='paused');
   assert.equal((await update('accept','manual',s.openings[3].offers[0].id,true)).ok,true);
   s=await state();assert.equal(s.openings[3].status,'filled');assert.equal(s.openings[3].squarePending,true);
   await h.terminate();
  });
 }finally{await env.teardown();}
});
