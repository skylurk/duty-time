import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { DutyDay, Profile } from './duty';
import { readStationContacts } from './station-contacts';
import { reportContent } from './report-content';
export type ReportIdentity=Pick<Profile,'uid'|'company'|'name'|'lineManagerUids'>;
export function enqueueReport(db:Firestore,tx:Transaction,id:string,day:DutyDay,profile:ReportIdentity,kind:string){
  tx.create(db.collection('duty_time_reports').doc(id),{uid:profile.uid,company:profile.company,name:profile.name,date:day.date,managerUids:profile.lineManagerUids,day:{...day,audit:[]},kind,state:'queued',attempts:0,createdAt:Date.now()});
}
export async function sendReport(db:Firestore,auth:Auth,id:string,config:{apiKey?:string;from?:string}):Promise<string>{
 const ref=db.collection('duty_time_reports').doc(id),now=Date.now();
 const report=await db.runTransaction(async tx=>{const snap=await tx.get(ref),data=snap.data();if(!data||data.state==='sent'||data.state==='sending'&&data.leaseUntil>now)return null;
  if(!config.apiKey||!config.from){tx.update(ref,{state:'blocked',blockedReason:'Resend is not configured.'});return null;}
  if((data.attempts||0)>=10){tx.update(ref,{state:'blocked',blockedReason:'Delivery retry limit reached. Administrator attention is required.'});return null;}
  tx.update(ref,{state:'sending',leaseUntil:now+120000,attempts:(data.attempts||0)+1});return data;
 });
 if(!report)return (await ref.get()).data()?.state||'missing';
 try{
  const membership=(await db.collection('duty_time_user_data').doc(report.uid).get()).data();
  if(!membership||membership.company!==report.company)throw new Error('Membership unavailable');
  const managerUids:string[]=Array.isArray(membership.lineManagerUids)?membership.lineManagerUids:[];
  const eligible=await Promise.all(managerUids.map(async uid=>{const member=(await db.collection('duty_time_user_data').doc(uid).get()).data();if(!member||member.company!==report.company||!member.isLineManager||member.enabled===false)return null;const user=await auth.getUser(uid);return !user.disabled?user.email:null;}));
  const isAlert=['overtime_alert','rest_alert'].includes(report.kind);
  const settings=isAlert?(await db.collection('duty_time_settings').doc(report.company).get()).data():null;
  const extra:string[]=Array.isArray(settings?.alertEmails)?settings.alertEmails:[];
  const stationIds=new Set<string>(Array.isArray(report.stationIds)?report.stationIds:(report.day?.sessions||[]).map((s:{stationId:string})=>s.stationId));
  const stationContacts=isAlert&&stationIds.size?await readStationContacts(db,report.company):[];
  const stationEmails=stationContacts.filter(c=>c.active!==false&&stationIds.has(c.stationId)&&['maintenance','operations'].includes(c.department)).map(c=>c.email);
  const includeOwner=['automatic_checkout','actual_checkout'].includes(report.kind);
  const owner=includeOwner?await auth.getUser(report.uid):null;
  const recipients=[...new Set([...eligible,...extra,...stationEmails,...(owner?.email?[owner.email]:[])].filter((v):v is string=>typeof v==='string').map(v=>v.trim().toLowerCase()).filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))].sort();
  if(!recipients.length){await ref.update({state:'blocked',blockedReason:'No eligible recipient email addresses are assigned.'});return 'blocked';}
  // Persist the exact payload before sending: provider idempotency requires identical retries.
  let envelope=report.envelope as {from:string;to:string[];subject:string;text:string;html:string}|undefined;
  if(envelope&&envelope.to.some(email=>!recipients.includes(email))){await ref.update({state:'blocked',blockedReason:'Report recipients changed after a delivery attempt. Administrator review is required.'});return 'blocked';}
  if(!envelope){envelope={from:config.from!,to:recipients,...reportContent(report.name,report.day as DutyDay,report.kind,report.alertMessage)};await ref.update({envelope});}
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`duty-report/${id}`},body:JSON.stringify(envelope),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Resend did not accept the report');
  const receipt=await response.json() as {id:string};await ref.update({state:'sent',providerId:receipt.id,sentAt:Date.now(),blockedReason:''});return 'sent';
 }catch{await ref.update({state:'failed',nextAttemptAt:Date.now()+Math.min(3600000,60000*2**(report.attempts||0)),blockedReason:'Delivery failed. Check Resend configuration and retry.'});return 'failed';}
}
