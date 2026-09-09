import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminServices } from '@/lib/firebase/admin';
import { authenticate, fail, readBody, apiError } from '@/lib/server/access';
import { readStationContacts, stationContactId, contactDepartment, type ContactEntry } from '@/lib/station-contacts';
import { getStations } from '@/lib/server/data';
const identifier=z.string().min(1).max(200).regex(/^[^/]+$/);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),id:identifier.optional(),stationId:identifier,name:z.string().trim().min(2).max(150),email:z.union([z.email(),z.literal('')]),phone:z.string().trim().max(60)}).refine(v=>!!(v.email||v.phone),'Enter an email or phone number.'),
 z.object({action:z.literal('setActive'),id:identifier,stationId:identifier,active:z.boolean()})
]);
export async function GET(request:NextRequest){try{
 const actor=await authenticate(request);fail(actor.isAdmin,'Administrator access is required.',403);
 const stationId=identifier.parse(request.nextUrl.searchParams.get('stationId'));
 fail((await getStations(actor.profile.company)).some(s=>s.id===stationId),'Station not found.',404);
 const contacts=(await readStationContacts(adminServices().db,actor.profile.company)).filter(c=>c.stationId===stationId);
 return NextResponse.json({contacts},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return apiError(e);}}
export async function POST(request:NextRequest){try{
 const actor=await authenticate(request);fail(actor.isAdmin,'Administrator access is required.',403);
 const input=schema.parse(await readBody(request)),company=actor.profile.company,db=adminServices().db;
 fail((await getStations(company)).some(s=>s.id===input.stationId),'Station not found.',404);
 const ref=db.collection('duty_time_station_contacts').doc(stationContactId(company,input.stationId));
 await db.runTransaction(async tx=>{
  const old=await tx.get(ref);
  if(old.exists)fail(old.data()?.company===company&&old.data()?.stationId===input.stationId,'Station contact ownership mismatch.',409);
  // A station with legacy rows must be migrated before editing; reads remain compatible.
  const legacy=await tx.get(db.collection('duty_time_station_contacts').where('company','==',company));
  fail(!legacy.docs.some(d=>d.data().stationId===input.stationId&&d.data().schemaVersion!==2),'Station contacts are being migrated. Please refresh shortly.',409);
  const contacts={...(old.data()?.contacts||{})} as Record<string,ContactEntry>;
  if(input.id)fail(Object.hasOwn(contacts,input.id),'Contact not found.',404);
  let contactId=input.id||'';
  if(input.action==='setActive')contacts[input.id]={...contacts[input.id],active:input.active,updatedAt:Date.now(),updatedBy:actor.profile.uid};
  else{
   const department=contactDepartment(input.name);
   contactId=input.id||department;
   fail(contactId===input.id||!Object.hasOwn(contacts,contactId),'This contact type already exists. Edit its existing entry.',409);
   fail(Object.keys(contacts).length<100||!!input.id,'This station has reached its contact limit.',400);
   contacts[contactId]={active:input.id?contacts[input.id].active!==false:true,name:input.name,email:input.email,phone:input.phone,department,updatedAt:Date.now(),updatedBy:actor.profile.uid};
  }
  tx.set(ref,{company,stationId:input.stationId,schemaVersion:2,contacts,updatedAt:Date.now(),updatedBy:actor.profile.uid});
  tx.create(db.collection('duty_time_admin_audit').doc(),{action:'station_contact_'+input.action,company,stationId:input.stationId,contactId,before:old.data()?.contacts?.[contactId]||null,after:contacts[contactId],actorUid:actor.profile.uid,at:Date.now()});
 });
 return NextResponse.json({message:input.action==='setActive'?(input.active?'Contact reactivated.':'Contact deactivated. History is retained.'):'Contact saved.'});
}catch(e){return apiError(e);}}
