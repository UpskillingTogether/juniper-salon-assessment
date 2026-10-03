
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(date,options={})=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',...options}).format(new Date(date));
const dateText=s=>fmt(s,{weekday:'short',month:'short',day:'numeric'});
const timeText=s=>fmt(s,{hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const active=o=>o.offers.find(x=>['sending','waiting','paused'].includes(x.status));
let busy=false;
async function api(url,body){const res=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await res.json();if(!res.ok)throw Error(data.message||'Request failed.');return data;}
function toast(msg){$('#toast').hidden=false;$('#toast').textContent=msg;setTimeout(()=>$('#toast').hidden=true,6000);}
function countdown(deadline){const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
const button=(o,action,label,extra='')=>'<button '+extra+' data-opening="'+esc(o.id)+'" data-action="'+action+'">'+label+'</button>';
function renderSalon(s){
 $('#connection').textContent='';
 $('.text-link[href^="http://localhost:8233"]').href='http://localhost:8233/namespaces/default/workflows/'+encodeURIComponent(s.workflowId);
 const live=s.openings.filter(o=>['offering','searching','paused'].includes(o.status));
 const filled=s.openings.filter(o=>o.status==='filled').length;
 const resolved=s.openings.filter(o=>['filled','unfilled'].includes(o.status)).length;
 $('#stats').innerHTML=[[live.length,'Openings in progress'],[filled,'Openings filled'],[s.openings.filter(o=>o.status==='paused').length,'Need your attention'],[resolved?Math.round(filled/resolved*100)+'%':'—','Prototype refill rate · target 50%']].map(([n,label])=>'<div class="stat"><strong>'+n+'</strong><span>'+label+'</span></div>').join('');
 $('#opening-count').textContent=s.openings.length+' total';
 const expanded=new Set([...document.querySelectorAll('details[open]')].map(d=>d.dataset.id));
 $('#opening-list').innerHTML=s.openings.length?[...s.openings].reverse().map(o=>{
  const a=active(o);const closed=['filled','stopped'].includes(o.status);
  const strip=a?'<div class="offer-strip"><div><small>CURRENT OFFER</small><strong>'+esc(a.clientName)+'</strong><small>'+esc(a.status==='paused'?(a.pauseReason==='outage'?'Staff review required':'Delivery paused'):a.status==='sending'?'Sending simulated text…':'Waiting for a reply')+'</small></div><div class="deadline"><small>'+ (a.deadline?'TIME LEFT':'DEADLINE')+'</small><strong '+(a.deadline?'data-deadline="'+a.deadline+'"':'')+'>'+(a.deadline?countdown(a.deadline):(a.pauseReason==='outage'?'Paused':'Not started'))+'</strong>'+(a.deadline?'<small>'+timeText(a.deadline)+'</small>':'')+'</div></div>':'';
  let controls='';
  if(a?.status==='waiting')controls+='<a class="text-link" target="_blank" rel="noopener" href="/?offer='+encodeURIComponent(a.id)+'">Open client offer ↗</a>';
  if(a?.status==='paused')controls+=button(o,'retry',a.pauseReason==='outage'?'Resend with new window':'Retry delivery','data-offer=' + JSON.stringify(a.id));
  if(a&&['paused','waiting'].includes(a.status)){controls+=button(o,'accept','Record manual acceptance','data-offer="'+esc(a.id)+'"');controls+=button(o,'decline','Record manual decline','data-offer="'+esc(a.id)+'"');}
  if(!closed){controls+=button(o,'manualFill','Fill directly');controls+=button(o,'stop','Stop outreach','class="danger"');}
  const status=o.status==='searching'?'Waiting for eligible clients':o.status;
  return '<article class="opening-card"><div class="card-head"><h3>'+esc(o.service)+' with '+esc(o.stylist)+'</h3><span class="badge '+o.status+'">'+esc(status)+'</span></div><p class="meta">'+dateText(o.startsAt)+' · '+timeText(o.startsAt)+' · '+o.duration+' min'+(o.demo?' · FAST DEMO: 20s':' · '+o.responseMinutes+' min reply window')+'</p>'+strip+(a?.warning?'<div class="warning"><strong>Action needed · '+esc(a.clientName)+'</strong><br>'+esc(a.warning)+(a.pauseReason==='outage'&&a.previousDeadline?'<br><strong>Original deadline: '+dateText(a.previousDeadline)+' · '+timeText(a.previousDeadline)+'</strong><br>Resending grants a fresh response window.':'')+'</div>':'')+(o.status==='filled'?'<p>Held for <strong>'+esc(o.bookedBy)+'</strong>. This opening is closed.</p>':'')+(o.status==='unfilled'?'<p class="warning">No eligible clients remain. The opening is still unfilled; contact others manually.</p>':'')+(o.status==='stopped'?'<p class="muted">Outreach stopped. Previous offer links are invalid.</p>':'')+'<div class="actions">'+controls+'</div>'+(o.squarePending?'<div class="square"><strong>Square follow-up needed</strong><br>Update the client’s existing appointment manually in Square. '+button(o,'squareDone','Mark done')+'</div>':'')+'<details data-id="'+esc(o.id)+'" '+(expanded.has(o.id)?'open':'')+'><summary>Offer history · '+o.history.length+' events</summary><ul class="history">'+o.history.map(h=>'<li><time>'+fmt(h.at,{hour:'numeric',minute:'2-digit'})+'</time><span>'+esc(h.message)+'</span></li>').join('')+'</ul></details></article>';
 }).join(''):'<div class="empty"><div class="flower">✳</div><h3>A little room for a new visit.</h3><p>Add a canceled appointment to get started.<br>We’ll find the right client and take care of the wait.</p></div>';
 $('#waitlist').innerHTML=s.clients.map(c=>{
 const reserved=s.openings.some(o=>active(o)?.clientId===c.id);
 return '<tr><td>'+esc(c.name)+'<small>'+esc(c.mobile)+'</small></td><td>'+esc(c.service)+'</td><td>'+esc(c.stylist)+'</td><td>'+c.fromHour+':00–'+c.toHour+':00</td><td>'+esc(c.joinedAt)+'</td><td><span class="badge">'+(c.booked?'Booked · off waitlist':reserved?'Offer reserved':'Ready')+'</span></td></tr>';
 }).join('');
}
const offerId=new URLSearchParams(location.search).get('offer');
async function refresh(){
 if(busy)return;
 try{
 if(offerId){const d=await api('/api/offers/'+encodeURIComponent(offerId));renderClient(d);}
 else renderSalon(await api('/api/salon'));
 }catch(e){if(offerId)$('#client-view').textContent=e.message;else $('#connection').textContent=e.message;}
}
function renderClient({opening:o,offer:a}){
 const expired=a.status==='expired'||(a.status==='waiting'&&a.deadline<=Date.now());
 const canReply=a.status==='waiting'&&!expired&&o.status==='offering';
 const text=a.status==='accepted'?'Your appointment is held for you. The slot is no longer available to anyone else. Our team will handle changes to your existing appointment.':a.status==='declined'?'You declined this offer. Thank you for letting us know.':expired?'This offer has expired and can no longer claim the appointment.':a.status==='canceled'?'This offer was canceled because the opening is no longer available.':a.status==='paused'?'Your offer is paused for staff review. Please contact Juniper Salon. Acceptance is temporarily unavailable.':a.status==='sending'?'Your offer is being prepared. The deadline starts after delivery.':'An earlier visit is waiting for you.';
 $('#client-view').innerHTML='<p class="eyebrow">A LITTLE GOOD NEWS FROM JUNIPER</p><section class="client-card"><h1>'+(a.status==='accepted'?'See you soon, ':'An earlier visit, ')+esc(a.clientName.split(' ')[0])+'.</h1><p class="muted">An opening that fits your waitlist request.</p><div class="client-details"><div><small>SERVICE</small><strong>'+esc(o.service)+'</strong></div><div><small>STYLIST</small><strong>'+esc(o.stylist)+'</strong></div><div><small>DATE</small><strong>'+dateText(o.startsAt)+'</strong></div><div><small>TIME</small><strong>'+timeText(o.startsAt)+'</strong></div></div><div class="client-status">'+esc(text)+(a.deadline?'<br><strong>Response deadline: '+timeText(a.deadline)+'</strong><br>'+dateText(a.deadline)+(canReply?' · <span data-deadline="'+a.deadline+'">'+countdown(a.deadline)+'</span> remaining':''):'')+'</div>'+(o.demo?'<p class="muted small">Fast demo uses a 20-second response window.</p>':'')+'<div class="actions">'+(canReply?'<button class="primary" data-reply="accept">Accept appointment</button><button data-reply="decline">Decline</button>':'')+'</div><p class="muted small">Only your current offer can be accepted. Expired or canceled links cannot book a slot.</p></section>';
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button[data-action],button[data-reply]');if(!b||busy)return;
 if(b.dataset.action==='stop'&&!confirm('Stop this opening? The active client offer will be canceled immediately.'))return;
 let name;if(b.dataset.action==='manualFill'){name=prompt('Who booked this opening directly?');if(!name)return;}
 busy=true;b.disabled=true;
 try{const data=b.dataset.reply?await api('/api/offers/'+encodeURIComponent(offerId)+'/reply',{action:b.dataset.reply}):await api('/api/openings/'+b.dataset.opening+'/action',{action:b.dataset.action,offerId:b.dataset.offer,name});toast(data.message);}
 catch(e){toast(e.message);}finally{busy=false;await refresh();}
});
if(offerId){$('#dashboard').hidden=true;$('#client-view').hidden=false;}
else{
 // Convert salon wall time to ISO with Pacific offset, independent of browser timezone.
 const input=$('input[name="startsAt"]');const tomorrow=new Date(Date.now()+86400000);const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(tomorrow).map(p=>[p.type,p.value]));input.value=parts.year+'-'+parts.month+'-'+parts.day+'T14:00';
 $('#opening-form').addEventListener('submit',async e=>{
 e.preventDefault();const f=new FormData(e.target);const local=f.get('startsAt');const guess=new Date(local+':00Z');const offset=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',timeZoneName:'longOffset'}).formatToParts(guess).find(p=>p.type==='timeZoneName').value.replace('GMT','');
 const payload=Object.fromEntries(f);payload.startsAt=local+':00'+offset;payload.demo=f.has('demo');payload.failNext=f.has('failNext');const submit=e.target.querySelector('button');submit.disabled=true;
 try{const d=await api('/api/openings',payload);$('#form-message').textContent=d.message;await refresh();}catch(err){$('#form-message').textContent=err.message;}finally{submit.disabled=false;}
 });
}
refresh();setInterval(refresh,2000);setInterval(()=>document.querySelectorAll('[data-deadline]').forEach(el=>el.textContent=countdown(Number(el.dataset.deadline))),1000);

