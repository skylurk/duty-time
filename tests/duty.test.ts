import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, dutyTimer, parseTime, splitSession, validateSessions, totalForDay, overtimeForDays, csvCell, type Active, type DutyDay, type Session } from '../lib/duty';
const session = (date:string,start:string,end:string):Session=>({id:'session',stationId:'station',station:'Wilson',notes:'',start:parseTime(date,start),end:parseTime(date,end)});
const day = (date:string,sessions:Session[],status:DutyDay['status']='recorded'):DutyDay=>({id:date,uid:'test',company:'company',date,sessions,status,reason:'',closed:false,audit:[],revision:1});
test('Nairobi dates change at 21:00 UTC independently of the host timezone',()=>{
 assert.equal(dateKey(Date.parse('2026-09-07T20:59:59Z')),'2026-09-07');
 assert.equal(dateKey(Date.parse('2026-09-07T21:00:00Z')),'2026-09-08');
 assert.equal(parseTime('2026-09-08','08:00'),Date.parse('2026-09-08T05:00:00Z'));
});
test('invalid calendar dates and time formats are rejected',()=>{
 for(const [d,t] of [['2026-02-30','08:00'],['2026-13-01','08:00'],['2026-09-01','24:01'],['2026-09-01','8:00']])assert.throws(()=>parseTime(d,t));
});
test('fragmented shifts are summed and a short day does not cancel another day’s overtime',()=>{
 const first=day('2026-09-01',[session('2026-09-01','05:00','12:00'),session('2026-09-01','14:00','20:00')]);
 const second=day('2026-09-02',[session('2026-09-02','08:00','10:00')]);
 assert.equal(totalForDay(first),13*3600000);
 assert.equal(overtimeForDays([first,second]),3600000);
});
test('pending and rejected entries do not count as approved duty or overtime',()=>{
 for(const status of ['pending','rejected'] as const){const row=day('2026-09-01',[session('2026-09-01','06:00','20:00')],status);assert.equal(totalForDay(row),0);assert.equal(overtimeForDays([row]),0);}
});
test('overnight sessions split at Nairobi midnight without losing time',()=>{
 const active:Active={id:'shift',date:'2026-09-01',start:parseTime('2026-09-01','22:00'),stationId:'station',station:'Wilson',notes:'Night shift'};
 const end=parseTime('2026-09-02','04:00'),pieces=splitSession(active,end);
 assert.deepEqual(pieces.map(p=>p.date),['2026-09-01','2026-09-02']);
 assert.equal(pieces[0].session.end-pieces[0].session.start,2*3600000);
 assert.equal(pieces[1].session.end-pieces[1].session.start,4*3600000);
 assert.equal(pieces.reduce((sum,p)=>sum+p.session.end-p.session.start,0),end-active.start);
 for(const piece of pieces)validateSessions([piece.session],piece.date,end);
});
test('exact midnight check-out does not create an empty next-day session',()=>{
 const active:Active={id:'shift',date:'2026-09-01',start:parseTime('2026-09-01','22:00'),stationId:'station',station:'Wilson',notes:''};
 assert.equal(splitSession(active,parseTime('2026-09-02','00:00')).length,1);
});
test('overlapping, reversed, future, and wrong-day sessions are rejected',()=>{
 const now=parseTime('2026-09-03','12:00');
 assert.throws(()=>validateSessions([session('2026-09-01','08:00','10:00'),session('2026-09-01','09:59','12:00')],'2026-09-01',now),/overlap/);
 assert.throws(()=>validateSessions([session('2026-09-01','10:00','08:00')],'2026-09-01',now));
 assert.throws(()=>validateSessions([session('2026-09-03','11:00','13:00')],'2026-09-03',now));
 assert.throws(()=>validateSessions([session('2026-09-02','08:00','10:00')],'2026-09-01',now));
 assert.doesNotThrow(()=>validateSessions([session('2026-09-01','08:00','10:00'),session('2026-09-01','10:00','12:00')],'2026-09-01',now));
});
test('CSV values cannot inject formulas or break quoted columns',()=>{
 assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');
 assert.equal(csvCell('Wilson, "Airport"'),'"Wilson, ""Airport"""');
 assert.equal(csvCell('  +SUM(A1)'),'"\'  +SUM(A1)"');
});

test('an open timer resumes its full elapsed duration across midnight and multiple days',()=>{
 const active:Active={id:'open',date:'2026-09-01',start:parseTime('2026-09-01','08:00'),stationId:'station',station:'Wilson',notes:''};
 const resumedAt=parseTime('2026-09-03','10:00');
 const resumed=dutyTimer(active,null,resumedAt);
 assert.equal(resumed.displayTotal,50*3600000);
 assert.equal(resumed.todayTotal,10*3600000);
 assert.equal(dutyTimer(active,null,resumedAt+5000).displayTotal,resumed.displayTotal+5000);
 // Reopening with a freshly loaded copy of the record produces the same timer.
 assert.deepEqual(dutyTimer(JSON.parse(JSON.stringify(active)),null,resumedAt),resumed);
});
test('the current-session clock stays separate from earlier completed sessions today',()=>{
 const date='2026-09-03',active:Active={id:'open',date,start:parseTime(date,'15:00'),stationId:'station',station:'Wilson',notes:''};
 const completed=day(date,[session(date,'08:00','12:00')]);
 assert.deepEqual(dutyTimer(active,completed,parseTime(date,'17:00')),{sessionElapsed:2*3600000,todayTotal:6*3600000,displayTotal:2*3600000});
 assert.equal(dutyTimer(null,completed,parseTime(date,'17:00')).displayTotal,4*3600000);
});
test('midnight ignores yesterday’s cached totals while keeping the open session running',()=>{
 const date='2026-09-02',active:Active={id:'open',date,start:parseTime(date,'22:00'),stationId:'station',station:'Wilson',notes:''};
 const yesterday=day(date,[session(date,'08:00','12:00')]);
 assert.deepEqual(dutyTimer(active,yesterday,parseTime('2026-09-03','00:00')),{sessionElapsed:2*3600000,todayTotal:0,displayTotal:2*3600000});
});
