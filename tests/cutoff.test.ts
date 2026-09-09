import test from 'node:test';
import assert from 'node:assert/strict';
import { cutoffFor, canCheckIn, automaticPieces, correctedDays, type AutoCheckout } from '../lib/cutoff';
import { parseTime, totalForDay, overtimeForDays, type Active, type DutyDay } from '../lib/duty';
import { autoCheckoutUser } from '../lib/auto-checkout';
import { sendReport } from '../lib/report-worker';
import { reportContent } from '../lib/report-content';
import type { Auth } from 'firebase-admin/auth';
import { memoryFirestore } from './memory-firestore';
const date='2026-09-08',start=parseTime(date,'08:00'),cutoff=parseTime(date,'19:00');
const active:Active={id:'open',date,start,stationId:'station',station:'Wilson',notes:'',cutoffAt:cutoff,cutoffTime:'19:00'};
const record:AutoCheckout={id:'member_open',uid:'member',company:'company',active,cutoffAt:cutoff,processedAt:cutoff+60000,pending:true,affectedDates:[date]};
function pendingDay():DutyDay{return{id:`member_${date}`,uid:'member',company:'company',date,sessions:automaticPieces(active,cutoff,record.id).map(p=>p.session),status:'pending_checkout',reason:'',closed:false,audit:[],revision:1};}
function database(){return memoryFirestore({'duty_time_state/member':{uid:'member',company:'company',active},'duty_time_user_data/member':{uid:'member',company:'company',lineManagerUids:['manager']},'duty_time_user_data/manager':{uid:'manager',company:'company',isLineManager:true,enabled:true},'users_new/member':{uid:'member',first_name:'Test',last_name:'Member'}});}
test('default cutoff is 7pm EAT; manager overrides are honored',()=>{
 assert.deepEqual(cutoffFor(start),{cutoffAt:cutoff,cutoffTime:'19:00'});
 assert.equal(cutoffFor(start,'17:30').cutoffAt,parseTime(date,'17:30'));
 assert.equal(cutoffFor(start,'invalid').cutoffAt,cutoff);
});
test('check-in is blocked at and after cutoff, including attempts to backdate manually',()=>{
 assert.equal(canCheckIn(cutoff-1),true);assert.equal(canCheckIn(cutoff),false);assert.equal(canCheckIn(cutoff+3600000),false);
 assert.equal(canCheckIn(cutoff,'21:00'),true);
});
test('scheduler never closes early and records the cutoff rather than its delayed run time',async()=>{
 const {db,rows}=database();assert.deepEqual(await autoCheckoutUser(db,'member',cutoff-1),[]);
 assert.equal(await autoCheckoutUser(db,'member',cutoff+900000).then(r=>r.length),1);
 const day=rows.get(`duty_time_days/member_${date}`) as DutyDay;
 assert.equal(day.sessions[0].end,cutoff);assert.equal(day.status,'pending_checkout');assert.equal(totalForDay(day),0);
 assert.equal((rows.get('duty_time_state/member') as {active:unknown}).active,null);
 assert.deepEqual((rows.get('duty_time_state/member') as {pendingAutoCheckoutIds:string[]}).pendingAutoCheckoutIds,['member_open']);
});
test('repeated or concurrent automatic checks create one checkout, audit, and report',async()=>{
 const {db,rows}=database();const results=await Promise.all([autoCheckoutUser(db,'member',cutoff),autoCheckoutUser(db,'member',cutoff)]);
 assert.equal(results.flat().length,1);assert.equal([...rows.keys()].filter(k=>k.startsWith('duty_time_reports/')).length,1);assert.equal([...rows.keys()].filter(k=>k.startsWith('duty_time_audit/')).length,1);
});
test('a session already checked out manually is untouched by the scheduler',async()=>{
 const {db,rows}=database();rows.set('duty_time_state/member',{uid:'member',company:'company',active:null});
 assert.deepEqual(await autoCheckoutUser(db,'member',cutoff),[]);assert.equal([...rows.keys()].some(k=>k.startsWith('duty_time_reports/')),false);
});
test('pending automatic hours are excluded while other confirmed sessions still count',()=>{
 const day=pendingDay();day.sessions.unshift({id:'earlier',start:parseTime(date,'05:00'),end:parseTime(date,'07:00'),stationId:'station',station:'Wilson',notes:''});assert.equal(totalForDay(day),7200000);assert.equal(overtimeForDays([day]),0);
});
test('actual checkout replaces provisional time and recalculates confirmed overtime',()=>{
 const [day]=correctedDays(record,[pendingDay()],parseTime(date,'17:30'),cutoff,null);
 assert.equal(day.sessions[0].end,parseTime(date,'17:30'));assert.equal(day.status,'recorded');assert.equal(totalForDay(day),9.5*3600000);assert.equal(overtimeForDays([day]),0);
});
test('actual checkout can extend beyond cutoff and across midnight',()=>{
 const end=parseTime('2026-09-09','02:00');const days=correctedDays(record,[pendingDay()],end,end,null);
 assert.equal(days.length,2);assert.equal(days.reduce((n,d)=>n+totalForDay(d),0),18*3600000);
 assert.ok(days.every(d=>d.status==='recorded'&&d.sessions.every(s=>!s.autoCheckoutPending)));
});
test('correction rejects future time, reversed time, already resolved records, and overlap',()=>{
 assert.throws(()=>correctedDays(record,[pendingDay()],cutoff+1,cutoff,null),/future/);
 assert.throws(()=>correctedDays(record,[pendingDay()],start-1,cutoff,null));
 assert.throws(()=>correctedDays({...record,pending:false},[pendingDay()],cutoff,cutoff,null),/already/);
 const day=pendingDay();day.sessions.push({id:'new',start:parseTime(date,'19:30'),end:parseTime(date,'20:00'),stationId:'station',station:'Wilson',notes:''});
 assert.throws(()=>correctedDays(record,[day],parseTime(date,'21:00'),parseTime(date,'22:00'),null),/overlap/);
 assert.throws(()=>correctedDays(record,[pendingDay()],parseTime(date,'21:00'),parseTime(date,'22:00'),{...active,start:parseTime(date,'20:00')}),/overlap/);
});
test('automatic email clearly identifies pending status and does not label provisional hours confirmed',()=>{
 const content=reportContent('<Test>',pendingDay(),'automatic_checkout');assert.match(content.subject,/automatic checkout/);assert.match(content.text,/Pending actual checkout/);assert.match(content.text,/Confirmed total: 0h 0m/);assert.match(content.text,/Provisional hours awaiting actual checkout: 11h 0m/);assert.match(content.html,/&lt;Test&gt;/);
});
test('automatic reports email the member and manager and retries do not resend accepted reports',async(t)=>{
 const {db,rows}=database();const [id]=await autoCheckoutUser(db,'member',cutoff);
 const sent:{to:string[]}[]=[];t.mock.method(globalThis,'fetch',async(_url:unknown,options:{body:string})=>{sent.push(JSON.parse(options.body));return new Response(JSON.stringify({id:'provider-id'}),{status:200});});
 const auth={getUser:async(uid:string)=>({email:`${uid}@example.com`,disabled:false})} as unknown as Auth;
 assert.equal(await sendReport(db,auth,id,{apiKey:'test-only',from:'duty@example.com'}),'sent');
 assert.deepEqual(sent[0].to,['manager@example.com','member@example.com']);
 await sendReport(db,auth,id,{apiKey:'test-only',from:'duty@example.com'});assert.equal(sent.length,1);
});
