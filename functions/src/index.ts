import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { autoCheckoutUser } from '../../lib/auto-checkout';
import { queueOvertimeAlerts } from '../../lib/alerts';
import { dateKey, DAY_MS } from '../../lib/duty';
import { sendReport } from '../../lib/report-worker';
initializeApp();
const apiKey=defineSecret('DUTY_TIME_RESEND_API_KEY');
const sender=defineSecret('DUTY_TIME_RESEND_FROM_EMAIL');
export const dutyTimeAutoCheckout=onSchedule({schedule:'every 1 minutes',timeZone:'Africa/Nairobi',region:'europe-west1',secrets:[apiKey,sender],timeoutSeconds:540,memory:'256MiB',maxInstances:1,retryCount:3},async()=>{
 const db=getFirestore(),auth=getAuth();let last:QueryDocumentSnapshot|undefined,failures=0,processed=0;
 // A nested-field index selects only open sessions; closed states have no active.start.
 do{
  const query=db.collection('duty_time_state').where('active.start','>',0).orderBy('active.start').limit(100);
  const page=await (last?query.startAfter(last):query).get();
  if(page.empty)break;
  for(const state of page.docs){if(!state.data().active)continue;try{await queueOvertimeAlerts(db,state.id);const ids=await autoCheckoutUser(db,state.id);processed+=ids.length;}catch{failures++;logger.error('Automatic checkout needs attention',{stateId:state.id});}}
  last=page.size===100?page.docs[page.size-1]:undefined;
 }while(last);
 const recent=await db.collection('duty_time_days').where('date','>=',dateKey(Date.now()-2*DAY_MS,'UTC')).get();
 for(const uid of new Set(recent.docs.map(d=>String(d.data().uid)))){try{await queueOvertimeAlerts(db,uid);}catch{failures++;logger.error('Duty threshold check needs attention',{uid});}}
 const config={apiKey:apiKey.value(),from:sender.value()};
 // Old unsent reports survive restarts; each delivery uses its own transactional lease.
 for(const status of ['queued','failed','sending']){
  const reports=await db.collection('duty_time_reports').where('state','==',status).limit(100).get();
  for(const report of reports.docs){const r=report.data();if((r.nextAttemptAt||0)>Date.now()||(r.state==='sending'&&r.leaseUntil>Date.now()))continue;try{await sendReport(db,auth,report.id,config);}catch{failures++;logger.error('Report retry needs attention',{reportId:report.id});}}
 }
 logger.info('DutyTime cutoff sweep complete',{reportsQueued:processed,failures});
 if(failures)throw new Error('Some DutyTime work requires retry.');
});
