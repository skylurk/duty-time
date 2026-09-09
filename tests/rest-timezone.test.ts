import test from 'node:test';
import assert from 'node:assert/strict';
import { restDecision } from '../lib/rest';
import { parseTime, dateKey, splitSession, totalForDay, TARGET_MS, type DutyDay } from '../lib/duty';
import { cutoffFor,canCheckIn } from '../lib/cutoff';
import { queueAlert, queueOvertimeAlerts } from '../lib/alerts';
import { sendReport } from '../lib/report-worker';
import { memoryFirestore } from './memory-firestore';
import type { Auth } from 'firebase-admin/auth';
function day(end='21:00'):DutyDay{return {id:'u_2026-09-08',uid:'u',company:'c',date:'2026-09-08',sessions:[{id:'s',start:parseTime('2026-09-08','08:00'),end:parseTime('2026-09-08',end),stationId:'nbo',station:'Nairobi',notes:''}],status:'recorded',reason:'',closed:false,audit:[],revision:1};}
test('next-day check-in is denied before eight hours, allowed at the exact boundary',()=>{
 const d=day();assert.ok(restDecision([d],parseTime('2026-09-09','04:59')));
 assert.equal(restDecision([d],parseTime('2026-09-09','05:00')),null);
});
test('same-day breaks remain allowed and first-ever check-in needs no rest record',()=>{
 assert.equal(restDecision([day('10:00')],parseTime('2026-09-08','11:00')),null);
 assert.equal(restDecision([],parseTime('2026-09-09','05:00')),null);
});
test('latest checkout controls rest regardless of document order or earlier sessions',()=>{
 const a=day('10:00'),b=day('23:00');assert.ok(restDecision([b,a],parseTime('2026-09-09','06:00')));
});
test('pending actual checkout must be resolved before next-day rest is verified',()=>{
 const d=day();d.sessions[0].autoCheckoutPending=true;d.status='pending_checkout';
 assert.match(restDecision([d],parseTime('2026-09-09','10:00'))!.message,/actual checkout/);
});
test('rest uses elapsed UTC hours across station changes',()=>{
 assert.ok(restDecision([day('23:00')],parseTime('2026-09-09','05:59','Africa/Juba'),'Africa/Juba'));
 assert.equal(restDecision([day('23:00')],parseTime('2026-09-09','06:00','Africa/Juba'),'Africa/Juba'),null);
});
test('station-local cutoffs resolve to different Zulu instants',()=>{
 const start=Date.parse('2026-09-08T06:00:00Z');
 assert.equal(cutoffFor(start,null,'Africa/Nairobi').cutoffAt,Date.parse('2026-09-08T16:00:00Z'));
 assert.equal(cutoffFor(start,null,'Africa/Juba').cutoffAt,Date.parse('2026-09-08T17:00:00Z'));
 assert.equal(canCheckIn(Date.parse('2026-09-08T16:30:00Z'),null,'Africa/Juba'),true);
 assert.equal(canCheckIn(Date.parse('2026-09-08T16:30:00Z'),null,'Africa/Nairobi'),false);
});
test('station-local midnight splitting preserves UTC duration and station metadata',()=>{
 const start=parseTime('2026-09-08','23:00','Africa/Juba'),end=parseTime('2026-09-09','02:00','Africa/Juba');
 const pieces=splitSession({id:'s',date:'2026-09-08',start,stationId:'aweil',station:'Aweil',notes:'',timeZone:'Africa/Juba'},end);
 assert.deepEqual(pieces.map(p=>p.date),['2026-09-08','2026-09-09']);assert.equal(pieces[0].session.end-start,3600000);assert.equal(pieces[1].session.timeZone,'Africa/Juba');
});
test('daylight-saving nonexistent and ambiguous local inputs are rejected',()=>{
 assert.throws(()=>parseTime('2026-03-29','01:30','Europe/London'));
 assert.throws(()=>parseTime('2026-10-25','01:30','Europe/London'));
 assert.equal(dateKey(parseTime('2026-07-01','19:00','Europe/London'),'Europe/London'),'2026-07-01');
});
test('threshold is strictly above twelve hours',()=>{
 assert.equal(TARGET_MS,12*3600000);assert.equal(totalForDay(day('20:00'))>TARGET_MS,false);assert.equal(totalForDay(day('20:01'))>TARGET_MS,true);
});
test('alert transactions deduplicate and delivery includes eligible managers plus extra contacts only',async t=>{
 const {db,rows}=memoryFirestore({'duty_time_user_data/u':{company:'c',lineManagerUids:['m','foreign']},'duty_time_user_data/m':{company:'c',isLineManager:true},'duty_time_user_data/foreign':{company:'other',isLineManager:true},'duty_time_settings/c':{alertEmails:['safety@example.com','m@example.com']}});
 const ids=await Promise.all([queueAlert(db,'u',day(),'rest_alert','Rest needed','today'),queueAlert(db,'u',day(),'rest_alert','Rest needed','today')]);
 assert.equal(ids[0],ids[1]);assert.equal([...rows.keys()].filter(k=>k.startsWith('duty_time_reports/')).length,1);
 const sent:{to:string[]}[]=[];t.mock.method(globalThis,'fetch',async(_url:unknown,options:{body:string})=>{sent.push(JSON.parse(options.body));return new Response(JSON.stringify({id:'test'}));});
 const auth={getUser:async(uid:string)=>({email:uid+'@example.com',disabled:false})} as unknown as Auth;
 assert.equal(await sendReport(db,auth,ids[0],{apiKey:'test',from:'test@example.com'}),'sent');assert.deepEqual(sent[0].to,['m@example.com','safety@example.com']);
 await sendReport(db,auth,ids[0],{apiKey:'test',from:'test@example.com'});assert.equal(sent.length,1);
});
test('scheduled alerts combine completed and active duty, trigger once strictly past twelve hours',async()=>{
 const d=day('18:00');const active={id:'active',date:d.date,start:parseTime(d.date,'19:00'),stationId:'nbo',station:'Nairobi',notes:'',cutoffAt:parseTime(d.date,'23:00')};
 const {db,rows}=memoryFirestore({'duty_time_user_data/u':{company:'c',lineManagerUids:[]},'duty_time_days/u_2026-09-08':d,'duty_time_state/u':{company:'c',active}});
 assert.deepEqual(await queueOvertimeAlerts(db,'u',parseTime(d.date,'21:00')),[]);
 assert.equal((await queueOvertimeAlerts(db,'u',parseTime(d.date,'21:01'))).length,1);
 await queueOvertimeAlerts(db,'u',parseTime(d.date,'22:00'));
 assert.equal([...rows.keys()].filter(k=>k.startsWith('duty_time_reports/')).length,1);
 assert.ok((rows.get('duty_time_state/u') as {active:unknown}).active);
});
test('scheduler caps elapsed duty at cutoff when its run is delayed',async()=>{
 const d=day('18:00');const active={id:'active',date:d.date,start:parseTime(d.date,'19:00'),stationId:'nbo',station:'Nairobi',notes:'',cutoffAt:parseTime(d.date,'20:00')};
 const {db}=memoryFirestore({'duty_time_user_data/u':{company:'c',lineManagerUids:[]},'duty_time_days/u_2026-09-08':d,'duty_time_state/u':{company:'c',active}});
 assert.deepEqual(await queueOvertimeAlerts(db,'u',parseTime(d.date,'23:00')),[]);
});
test('duty alerts include maintenance and operations at duty stations, plus configured recipients',async t=>{
 const {db,rows}=memoryFirestore({'duty_time_user_data/u':{company:'c',lineManagerUids:['m']},'duty_time_user_data/m':{company:'c',isLineManager:true},'duty_time_settings/c':{alertEmails:['extra@example.com','MAINT@example.com']},
 'duty_time_station_contacts/maintenance':{company:'c',stationId:'nbo',name:'Maintenance',email:'maint@example.com'},
 'duty_time_station_contacts/ops':{company:'c',stationId:'nbo',name:'operations',email:'ops@example.com'},
 'duty_time_station_contacts/other':{company:'c',stationId:'aweil',name:'Operations',email:'other@example.com'},
 'duty_time_station_contacts/foreign':{company:'foreign',stationId:'nbo',name:'Maintenance',email:'foreign@example.com'},
 'duty_time_station_contacts/finance':{company:'c',stationId:'nbo',name:'Finance',email:'finance@example.com'}});
 const id=await queueAlert(db,'u',day(),'overtime_alert','Over twelve hours','date');
 assert.deepEqual((rows.get('duty_time_reports/'+id) as {stationIds:string[]}).stationIds,['nbo']);
 let sent:{to:string[]}|undefined;t.mock.method(globalThis,'fetch',async(_url:unknown,options:{body:string})=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({id:'test'}));});
 const auth={getUser:async()=>({email:'manager@example.com',disabled:false})} as unknown as Auth;
 assert.equal(await sendReport(db,auth,id,{apiKey:'test',from:'test@example.com'}),'sent');
 assert.deepEqual(sent!.to,['extra@example.com','maint@example.com','manager@example.com','ops@example.com']);
});
test('rest alerts use the attempted station even when there are no saved sessions',async t=>{
 const {db}=memoryFirestore({'duty_time_user_data/u':{company:'c',lineManagerUids:[]},'duty_time_station_contacts/ops':{company:'c',stationId:'aweil',name:'Operations',email:'aweil@example.com'},'duty_time_station_contacts/nbo':{company:'c',stationId:'nbo',name:'Maintenance',email:'nbo@example.com'}});
 const blank={...day(),sessions:[]};const id=await queueAlert(db,'u',blank,'rest_alert','Rest needed','attempt',['aweil']);
 let sent:{to:string[]}|undefined;t.mock.method(globalThis,'fetch',async(_url:unknown,options:{body:string})=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({id:'test'}));});
 assert.equal(await sendReport(db,{} as Auth,id,{apiKey:'test',from:'test@example.com'}),'sent');assert.deepEqual(sent!.to,['aweil@example.com']);
});
