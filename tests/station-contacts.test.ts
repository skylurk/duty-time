import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenStationContacts,groupedContacts,stationContactId } from '../lib/station-contacts';
import { memoryFirestore } from './memory-firestore';
import { queueAlert } from '../lib/alerts';
import { sendReport } from '../lib/report-worker';
import type { DutyDay } from '../lib/duty';
import type { Auth } from 'firebase-admin/auth';
const rows=[{id:'a',data:{company:'c',stationId:'s',name:'Operations',email:'ops@example.com',phone:'0700123456'}},{id:'b',data:{company:'c',stationId:'s',name:'Maintenance',email:'maint@example.com',phone:'0710123456'}}];
test('migration groups departments and preserves phone strings and duplicate entries',()=>{
 const doc=groupedContacts([...rows,{id:'dup',data:{...rows[0].data,email:'ops2@example.com'}}],'c','s');
 assert.equal(doc.contacts.operations.phone,'0700123456');assert.equal(doc.contacts.maintenance.email,'maint@example.com');assert.equal(doc.contacts.operations_2.email,'ops2@example.com');assert.equal(doc.contacts.operations_2.department,'operations');
});
test('canonical station document overrides legacy contacts and respects company scope',()=>{
 const canonical={id:stationContactId('c','s'),data:{...groupedContacts(rows,'c','s'),contacts:{}}};
 assert.deepEqual(flattenStationContacts([...rows,canonical],'c'),[]);
 assert.deepEqual(flattenStationContacts(rows,'other'),[]);
 assert.equal(flattenStationContacts(rows,'c').length,2);
});
test('migration preserves existing canonical entries on key collisions',()=>{
 const canonical={id:'c_s',data:groupedContacts(rows,'c','s')};const doc=groupedContacts([canonical,{id:'new',data:{...rows[0].data,email:'new@example.com'}}],'c','s');
 assert.equal(doc.contacts.operations.email,'ops@example.com');assert.equal(doc.contacts.operations_2.email,'new@example.com');
});
test('alerts route from stable department fields in station maps',async t=>{
 const canonical=groupedContacts(rows,'c','s');canonical.contacts.maintenance.name='Technical team';
 const {db}=memoryFirestore({'duty_time_user_data/u':{company:'c',lineManagerUids:[]},'duty_time_station_contacts/c_s':canonical});
 const day:DutyDay={id:'u_day',uid:'u',company:'c',date:'2026-09-09',sessions:[],status:'recorded',reason:'',closed:false,audit:[],revision:0};
 const id=await queueAlert(db,'u',day,'rest_alert','Rest required','test',['s']);let to:string[]=[];
 t.mock.method(globalThis,'fetch',async(_url:unknown,options:{body:string})=>{to=JSON.parse(options.body).to;return new Response(JSON.stringify({id:'test'}));});
 assert.equal(await sendReport(db,{} as Auth,id,{apiKey:'test',from:'test@example.com'}),'sent');assert.deepEqual(to,['maint@example.com','ops@example.com']);
});
test('deactivated station contacts remain stored but do not receive automatic alerts',async t=>{
 const canonical=groupedContacts(rows,'c','s');canonical.contacts.maintenance.active=false;
 const {db,rows:stored}=memoryFirestore({'duty_time_user_data/u':{company:'c',lineManagerUids:[]},'duty_time_station_contacts/c_s':canonical});
 const day:DutyDay={id:'u_day',uid:'u',company:'c',date:'2026-09-09',sessions:[],status:'recorded',reason:'',closed:false,audit:[],revision:0};
 const id=await queueAlert(db,'u',day,'rest_alert','Rest required','inactive',['s']);let to:string[]=[];
 t.mock.method(globalThis,'fetch',async(_url:unknown,options:{body:string})=>{to=JSON.parse(options.body).to;return new Response(JSON.stringify({id:'test'}));});
 assert.equal(await sendReport(db,{} as Auth,id,{apiKey:'test',from:'test@example.com'}),'sent');assert.deepEqual(to,['ops@example.com']);
 assert.equal(flattenStationContacts([{id:'c_s',data:stored.get('duty_time_station_contacts/c_s') as Record<string,unknown>}],'c').length,2);
});
