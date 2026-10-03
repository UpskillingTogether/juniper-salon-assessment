import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { salonWorkflow } from './workflows';
import type { Command, SalonState, Opening } from './types';
const app=express(); app.use(express.json({limit:'20kb'})); app.use(express.static(path.join(process.cwd(),'public')));
const workflowId='juniper-salon-v1'; let ready:Promise<Client>|undefined;
async function client() {
 ready??=Connection.connect({address:process.env.TEMPORAL_ADDRESS??'localhost:7233'}).then(async connection=>{
  const c=new Client({connection});
  try { await c.workflow.start(salonWorkflow,{workflowId,taskQueue:'juniper-salon',args:[]}); }
  catch(e) { if(!(e instanceof WorkflowExecutionAlreadyStartedError)) throw e; }
  return c;
 }).catch(e=>{ready=undefined;throw e;}); return ready;
}
async function command(cmd:Command) { const c=await client(); return c.workflow.getHandle(workflowId).executeUpdate<{ok:boolean;message:string}, [Command]>('salonCommand',{args:[cmd]}); }
app.get('/api/salon',async (_req,res)=>{const c=await client();res.json({...await c.workflow.getHandle(workflowId).query<SalonState>('getSalon'),workflowId});});
app.post('/api/openings',async (req,res)=>{
 const b=req.body; const date=new Date(b.startsAt);
 if(!['Cut','Color','Blowout'].includes(b.service)||!['Lena','Carla'].includes(b.stylist)||typeof b.startsAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/.test(b.startsAt)||!Number.isFinite(date.getTime())||date.getTime()<=Date.now()||![30,60,90,120].includes(Number(b.duration))) { res.status(400).json({message:'Choose a future appointment, valid service, stylist and duration.'});return; }
 const localToday=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date());
 const minutes=b.startsAt.slice(0,10)===localToday?15:Number(b.responseMinutes);
 if(!Number.isFinite(minutes)||minutes<1||minutes>1440){res.status(400).json({message:'Future response window must be 1–1440 minutes.'});return;}
 const id=randomUUID(); const opening:Opening={id,service:b.service,stylist:b.stylist,startsAt:b.startsAt,duration:Number(b.duration),responseMinutes:minutes,demo:b.demo===true,failNext:b.failNext===true,status:'searching',offers:[],history:[]};
 const result=await command({action:'create',openingId:id,opening});res.status(result.ok?201:409).json({...result,id});
});
app.post('/api/openings/:id/action',async(req,res)=>{
 if(!['retry','stop','manualFill','squareDone','accept','decline'].includes(req.body.action)) {res.status(400).json({message:'Invalid staff action.'});return;}
 const result=await command({action:req.body.action,openingId:req.params.id,offerId:req.body.offerId,manual:true,name:String(req.body.name||'Direct booking').slice(0,100)});res.status(result.ok?200:409).json(result);
});
app.get('/api/offers/:id',async(req,res)=>{
 const c=await client();const s=await c.workflow.getHandle(workflowId).query<SalonState>('getSalon'); const o=s.openings.find(o=>o.offers.some(x=>x.id===req.params.id)); const offer=o?.offers.find(x=>x.id===req.params.id);
 if(!o||!offer){res.status(404).json({message:'Offer not found.'});return;}
 res.json({opening:{service:o.service,stylist:o.stylist,startsAt:o.startsAt,duration:o.duration,status:o.status,demo:o.demo},offer});
});
app.post('/api/offers/:id/reply',async(req,res)=>{
 if(!['accept','decline'].includes(req.body.action)){res.status(400).json({message:'Choose accept or decline.'});return;}
 const c=await client();const s=await c.workflow.getHandle(workflowId).query<SalonState>('getSalon'); const o=s.openings.find(o=>o.offers.some(x=>x.id===req.params.id));
 if(!o){res.status(404).json({message:'Offer not found.'});return;}
 const result=await command({action:req.body.action,openingId:o.id,offerId:req.params.id});res.status(result.ok?200:409).json(result);
});
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(error);res.status(503).json({message:'Could not reach the salon workflow. Check Temporal and the Worker. Recorded progress is preserved.'});});
app.listen(Number(process.env.PORT??3000),()=>console.log(`Juniper Salon: http://localhost:${process.env.PORT??3000}`));
