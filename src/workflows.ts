import { condition, defineQuery, defineUpdate, proxyActivities, setHandler } from '@temporalio/workflow';
import type * as activities from './activities';
import type { SalonState, Command, CommandResult, Opening, Offer } from './types';
import { sampleClients } from './sample';
const { sendOffer } = proxyActivities<typeof activities>({ startToCloseTimeout:'10 seconds', retry:{maximumAttempts:1} });
export const getSalon = defineQuery<SalonState>('getSalon');
export const salonCommand = defineUpdate<CommandResult, [Command]>('salonCommand');

// One durable salon coordinator owns every opening and reservation. Synchronous
// Update handlers make acceptance + opening closure + client removal atomic.
export async function salonWorkflow(): Promise<void> {
  const state: SalonState = { clients: sampleClients.map(c=>({...c})), openings:[] };
  let revision = 0;
  const log = (o:Opening,message:string) => o.history.push({at:Date.now(),message});
  const active = (o:Opening): Offer | undefined => o.offers.find(x=>['sending','waiting','paused'].includes(x.status));
  setHandler(getSalon,()=>state);
  setHandler(salonCommand,(cmd)=>{
    if(cmd.action==='create') {
      if(state.openings.some(o=>o.id===cmd.openingId)) return {ok:true,message:'Opening already created.'};
      if(!cmd.opening) return {ok:false,message:'Opening details required.'};
      const start=new Date(cmd.opening.startsAt).getTime();
      if(state.openings.some(o=>o.status!=='stopped' && o.stylist===cmd.opening!.stylist && start<new Date(o.startsAt).getTime()+o.duration*60000 && start+cmd.opening!.duration*60000>new Date(o.startsAt).getTime())) return {ok:false,message:'This stylist already has an overlapping opening. Use the existing opening or stop it first.'};
      state.openings.push({...cmd.opening,offers:[],history:[],status:'searching'});
      log(state.openings[state.openings.length-1],'Opening created. Looking for the earliest eligible client.');
      revision++; return {ok:true,message:'Outreach started.'};
    }
    const o = state.openings.find(x=>x.id===cmd.openingId);
    if(!o) return {ok:false,message:'Opening not found.'};
    if(cmd.action==='squareDone') { o.squarePending=false; log(o,'Staff marked Square appointment follow-up complete.'); return {ok:true,message:'Follow-up complete.'}; }
    const offer = active(o);
    if(cmd.action==='stop' || cmd.action==='manualFill') {
      if(['filled','stopped'].includes(o.status)) return {ok:false,message:'This opening is already closed.'};
      if(offer) offer.status='canceled';
      o.status=cmd.action==='stop'?'stopped':'filled';
      if(cmd.action==='manualFill') { o.bookedBy=cmd.name || 'Direct booking'; o.squarePending=true; }
      log(o,cmd.action==='stop'?'Staff stopped outreach. All offer links are invalid.':`Staff filled this opening directly: ${o.bookedBy}. Active offer canceled.`);
      revision++; return {ok:true,message:'Opening closed. The previous offer cannot be accepted.'};
    }
    // Repeated acceptance is safe and returns its original confirmation.
    const prior=o.offers.find(x=>x.id===cmd.offerId);
    if(cmd.action==='accept' && prior?.status==='accepted') return {ok:true,message:'This appointment is held for you. The opening is closed.'};
    if(!offer || offer.id!==cmd.offerId) return {ok:false,message:'This offer is no longer available. It cannot claim the appointment.'};
    if(cmd.action==='retry') {
      if(offer.status!=='paused') return {ok:false,message:'Only paused deliveries can be retried.'};
      offer.status='sending'; offer.warning=undefined; o.status='offering'; log(o,'Staff retried delivery. The deadline starts after successful sending.'); revision++;
      return {ok:true,message:'Retry queued.'};
    }
    if(offer.status!=='waiting' && !(cmd.manual && offer.status==='paused')) return {ok:false,message:'This offer has not been successfully sent. Staff must resolve the delivery warning.'};
    if(offer.deadline && Date.now()>=offer.deadline) {
      offer.status='expired'; o.status='searching'; log(o,`${offer.clientName}: expired. Late replies cannot claim this slot.`); revision++;
      return {ok:false,message:'The response deadline has passed. This offer has expired.'};
    }
    if(cmd.action==='accept') {
      offer.status='accepted'; o.status='filled'; o.bookedBy=offer.clientName; o.squarePending=true;
      const client=state.clients.find(c=>c.id===offer.clientId)!; client.booked=true;
      log(o,`${offer.clientName} accepted${cmd.manual?' (recorded by staff)':''}. Opening closed and client removed from future offers. Update the existing appointment in Square.`);
      revision++; return {ok:true,message:'This appointment is held for you. The slot is no longer available to anyone else.'};
    }
    if(cmd.action==='decline') { offer.status='declined'; o.status='searching'; log(o,`${offer.clientName} declined${cmd.manual?' (recorded by staff)':''}. Moving to the next eligible client.`); revision++; return {ok:true,message:'Decline recorded. Thank you for letting us know.'}; }
    return {ok:false,message:'Unknown action.'};
  });
  while(true) {
    const seen=revision;
    for(const o of state.openings) {
      if(!['searching','offering','paused','unfilled'].includes(o.status)) continue;
      const current=active(o);
      if(current?.status==='waiting' && current.deadline!<=Date.now()) { current.status='expired'; o.status='searching'; revision++; log(o,`${current.clientName}: no reply before the deadline. Moving on automatically.`); }
      if(new Date(o.startsAt).getTime()<=Date.now()) { const a=active(o); if(a) a.status='canceled'; o.status='stopped'; log(o,'Appointment start time reached. Outreach stopped.'); continue; }
      if(!active(o) && o.status!=='unfilled') {
        const start=new Date(o.startsAt);
        // Browser submits local salon hour explicitly through its ISO offset.
        const hour=Number(o.startsAt.slice(11,13))+Number(o.startsAt.slice(14,16))/60;
        const eligible=state.clients.filter(c=>!c.booked && c.service===o.service && (c.stylist==='Any'||c.stylist===o.stylist) && hour>=c.fromHour && hour+o.duration/60<=c.toHour && !o.offers.some(x=>x.clientId===c.id)).sort((a,b)=>a.joinedAt.localeCompare(b.joinedAt));
        const client=eligible.find(c=>!state.openings.some(other=>active(other)?.clientId===c.id));
        if(client) { const offer:Offer={id:`${o.id}-${o.offers.length+1}`,clientId:client.id,clientName:client.name,status:'sending'}; o.offers.push(offer); o.status='offering'; log(o,`Offering to ${client.name}, the earliest available eligible client.`); }
        else if(!eligible.length) { o.status='unfilled'; log(o,'No eligible clients remain. Opening is unfilled; staff can contact others manually.'); }
        // If eligible clients are reserved elsewhere, wait for their reservation to release.
      }
      const toSend=active(o);
      if(toSend?.status==='sending') {
        const fail=o.failNext; o.failNext=false;
        try {
          await sendOffer({offerId:toSend.id,name:toSend.clientName,fail});
          // Cancellation may arrive while the Activity is in flight.
          if(toSend.status==='sending') { toSend.status='waiting'; toSend.deadline=Math.min(Date.now()+(o.demo?20_000:o.responseMinutes*60_000),new Date(o.startsAt).getTime()); o.status='offering'; log(o,`Text sent to ${toSend.clientName}. Response deadline started.`); }
        } catch {
          if(toSend.status==='sending') { toSend.status='paused'; toSend.warning='Text delivery failed. Contact this client manually or retry. No deadline has started.'; o.status='paused'; log(o,`${toSend.clientName}: delivery failed. Outreach paused; client reservation retained.`); }
        }
      }
    }
    const deadlines=state.openings.flatMap(o=>['searching','offering','paused'].includes(o.status)?[new Date(o.startsAt).getTime(),...o.offers.filter(x=>x.status==='waiting').map(x=>x.deadline!)]:[]);
    await condition(()=>revision!==seen,deadlines.length?Math.max(1,Math.min(...deadlines)-Date.now()):'1 day');
  }
}
