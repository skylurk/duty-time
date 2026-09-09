import type { Firestore } from 'firebase-admin/firestore';
import { dateKey, DAY_MS, TARGET_MS, totalForDay, splitSession, duration, zuluLabel, type DutyDay, type Active } from './duty';
import { enqueueReport } from './report-worker';
export async function queueAlert(db:Firestore,uid:string,day:DutyDay,kind:'overtime_alert'|'rest_alert',message:string,suffix:string,stationIds=day.sessions.map(s=>s.stationId)){
 const id=`${kind}_${uid}_${suffix}`;
 return db.runTransaction(async tx=>{
  const ref=db.collection('duty_time_reports').doc(id);
  const [existing,member,shared]=await tx.getAll(ref,db.collection('duty_time_user_data').doc(uid),db.collection('users_new').doc(uid));
  if(existing.exists)return id;
  const m=member.data();if(!m||m.company!==day.company)throw new Error('Alert membership unavailable.');
  const name=[shared.data()?.first_name,shared.data()?.last_name].filter(Boolean).join(' ')||'Team member';
  enqueueReport(db,tx,id,day,{uid,company:m.company,name,lineManagerUids:m.lineManagerUids||[]},kind);
  tx.update(ref,{alertMessage:message,stationIds:[...new Set(stationIds.filter(Boolean))]});return id;
 });
}
export async function queueOvertimeAlerts(db:Firestore,uid:string,now=Date.now(),includeDates:string[]=[]){
 const [state,rows,member]=await db.runTransaction(async tx=>Promise.all([tx.get(db.collection('duty_time_state').doc(uid)),tx.get(db.collection('duty_time_days').where('uid','==',uid)),tx.get(db.collection('duty_time_user_data').doc(uid))]));
 const m=member.data();if(!m)return [];
 const days=new Map<string,DutyDay>();
 const oldest=dateKey(now-2*DAY_MS,'UTC');
 for(const row of rows.docs){const d=row.data() as DutyDay;if(d.company===m.company&&(d.date>=oldest||includeDates.includes(d.date)))days.set(d.date,structuredClone(d));}
 const active=state.data()?.active as Active|undefined;
 if(active&&state.data()?.company===m.company){const end=Math.min(now,active.cutoffAt??now);if(end>active.start)for(const p of splitSession(active,end)){
  const day:DutyDay=days.get(p.date)||{id:`${uid}_${p.date}`,uid,company:m.company,date:p.date,sessions:[],status:'recorded',reason:'',closed:false,audit:[],revision:0};
  day.sessions.push(p.session);days.set(p.date,day);
 }}
 const ids:string[]=[];
 for(const day of days.values())if(totalForDay(day)>TARGET_MS)ids.push(await queueAlert(db,uid,day,'overtime_alert',`Daily duty exceeded 12 hours on ${day.date}: ${duration(totalForDay(day))}. Work may continue. Detected at ${zuluLabel(now)}.`,day.date));
 return ids;
}
