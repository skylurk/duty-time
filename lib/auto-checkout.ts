import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { cutoffFor, automaticPieces, recordedStatus, type AutoCheckout } from './cutoff';
import { validateSessions, type Active, type DutyDay } from './duty';
import { enqueueReport } from './report-worker';
/** Safe for overlapping scheduler runs and a simultaneous manual checkout. */
export async function autoCheckoutUser(db:Firestore,uid:string,now=Date.now()):Promise<string[]>{
 return db.runTransaction(async tx=>{
  const stateRef=db.collection('duty_time_state').doc(uid),memberRef=db.collection('duty_time_user_data').doc(uid);
  const [state,member]=await Promise.all([tx.get(stateRef),tx.get(memberRef)]);
  const active=state.data()?.active as Active|null|undefined,profile=member.data();
  if(!active||!profile||profile.uid!==uid||state.data()?.company!==profile.company)return [];
  const cutoffAt=active.cutoffAt??cutoffFor(active.start,profile.cutoffTime,active.timeZone).cutoffAt;
  if(!Number.isFinite(cutoffAt)||cutoffAt>now||cutoffAt<=active.start)return [];
  const id=`${uid}_${active.id}`,recordRef=db.collection('duty_time_auto_checkouts').doc(id);
  const pieces=automaticPieces(active,cutoffAt,id);
  const [record,shared,...snapshots]=await tx.getAll(recordRef,db.collection('users_new').doc(uid),...pieces.map(p=>db.collection('duty_time_days').doc(`${uid}_${p.date}`)));
  if(record.exists)return [];
  const days=pieces.map((piece,i)=>{
   const day:DutyDay=snapshots[i].exists?structuredClone(snapshots[i].data()) as DutyDay:{id:`${uid}_${piece.date}`,uid,company:profile.company,date:piece.date,sessions:[],status:'recorded',reason:'',closed:false,audit:[],revision:0};
   if(day.uid!==uid||day.company!==profile.company||day.status==='pending'||day.closed)throw new Error('Automatic checkout conflicts with an existing day.');
   day.sessions=[...(day.status==='rejected'?[]:day.sessions),piece.session].sort((a,b)=>a.start-b.start);
   validateSessions(day.sessions,day.date,now);day.status=recordedStatus(day.sessions);day.revision++;
   return day;
  });
  const name=[shared.data()?.first_name,shared.data()?.last_name].filter(Boolean).join(' ')||'Team member';
  const reportIds:string[]=[];
  for(const [i,day] of days.entries()){
   tx.set(db.collection('duty_time_days').doc(day.id),{...day,updatedAt:now});
   tx.create(db.collection('duty_time_audit').doc(`auto_${id}_${day.date}`),{dayId:day.id,uid,company:profile.company,actorUid:'system',actorName:'DutyTime system',at:now,action:'automatic_checkout',reason:'Automatic checkout at the configured cutoff. Pending actual checkout.',before:snapshots[i].data()?.sessions||[],after:day.sessions,statusAfter:day.status});
   const reportId=`auto_${id}_${day.date}`;enqueueReport(db,tx,reportId,day,{uid,company:profile.company,name,lineManagerUids:profile.lineManagerUids||[]},'automatic_checkout');reportIds.push(reportId);
  }
  const automatic:AutoCheckout={id,uid,company:profile.company,active,cutoffAt,processedAt:now,pending:true,affectedDates:days.map(d=>d.date)};
  tx.create(recordRef,automatic);
  tx.update(stateRef,{active:null,pendingAutoCheckoutIds:FieldValue.arrayUnion(id),updatedAt:now});
  return reportIds;
 });
}
