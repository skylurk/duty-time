import type { Firestore } from 'firebase-admin/firestore';
import type { StationContact } from './duty';
export type ContactEntry={active?:boolean;name:string;email:string;phone:string;department:string;updatedAt?:number;updatedBy?:string};
export type ContactDocument={company:string;stationId:string;contacts:Record<string,ContactEntry>;schemaVersion:2};
export const stationContactId=(company:string,stationId:string)=>`${company}_${stationId}`;
export function contactDepartment(name:string){return /\bmaintenance\b/i.test(name)?'maintenance':/\boperations\b/i.test(name)?'operations':name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'contact';}
export function contactEntry(value:Record<string,unknown>):ContactEntry{return {active:value.active!==false,name:String(value.name||''),email:String(value.email||''),phone:String(value.phone||''),department:String(value.department||contactDepartment(String(value.name||'')))};}
export type ContactRow={id:string;data:Record<string,unknown>};
/** Canonical station maps are authoritative, including empty maps after deletions. */
export function flattenStationContacts(rows:ContactRow[],company:string):Array<StationContact&{department:string}>{
 const owned=rows.filter(r=>r.data.company===company);
 const canonical=new Set(owned.filter(r=>r.data.schemaVersion===2&&r.id===stationContactId(company,String(r.data.stationId))).map(r=>String(r.data.stationId)));
 return owned.flatMap(row=>{const stationId=String(row.data.stationId||'');
  if(row.data.schemaVersion===2){if(row.id!==stationContactId(company,stationId))return [];return Object.entries((row.data.contacts||{}) as Record<string,Record<string,unknown>>).map(([id,v])=>({id,stationId,...contactEntry(v)}));}
  return canonical.has(stationId)?[]:[{id:row.id,stationId,...contactEntry(row.data)}];
 });
}
export async function readStationContacts(db:Firestore,company:string){const docs=await db.collection('duty_time_station_contacts').where('company','==',company).get();return flattenStationContacts(docs.docs.map(d=>({id:d.id,data:d.data()})),company);}
export function groupedContacts(rows:ContactRow[],company:string,stationId:string):ContactDocument{
 const doc:ContactDocument={company,stationId,contacts:{},schemaVersion:2};
 const owned=rows.filter(r=>r.data.company===company&&r.data.stationId===stationId).sort((a,b)=>a.id.localeCompare(b.id));
 for(const row of owned.filter(r=>r.data.schemaVersion===2))Object.assign(doc.contacts,row.data.contacts);
 for(const row of owned.filter(r=>r.data.schemaVersion!==2)){
  const value=contactEntry(row.data),base=contactDepartment(value.name);let key=base,n=2;while(doc.contacts[key])key=`${base}_${n++}`;doc.contacts[key]=value;
 }
 return doc;
}
