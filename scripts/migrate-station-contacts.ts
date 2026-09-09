import { loadEnvConfig } from '@next/env';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { groupedContacts, stationContactId } from '../lib/station-contacts';
async function main(){
 loadEnvConfig(process.cwd());
 const account=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY||'{}');
 if(account.project_id!==process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)throw new Error('Project mismatch.');
 const app=initializeApp({credential:cert(account)}),db=getFirestore(app);
 const admin=await getAuth(app).getUserByEmail('david@acuvera.com');
 if(!admin.customClaims?.duty_time_admin)throw new Error('DutyTime admin account is required.');
 const company=(await db.collection('duty_time_user_data').doc(admin.uid).get()).data()?.company;
 if(typeof company!=='string'||!company)throw new Error('Admin company is missing.');
 const docs=await db.collection('duty_time_station_contacts').where('company','==',company).get();
 const legacy=docs.docs.filter(d=>d.data().schemaVersion!==2);
 const stations=[...new Set(legacy.map(d=>String(d.data().stationId)))];
 const apply=process.argv.includes('--apply');
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',legacyContacts:legacy.length,stations:stations.length,existingStationDocuments:docs.size-legacy.length}));
 for(const stationId of stations){
  if(!stationId||stationId.includes('/'))throw new Error('Invalid legacy station ID.');
  if(!apply)continue;
  await db.runTransaction(async tx=>{
   const ref=db.collection('duty_time_station_contacts').doc(stationContactId(company,stationId));
   const [all,canonical]=await Promise.all([tx.get(db.collection('duty_time_station_contacts').where('company','==',company)),tx.get(ref)]);
   if(canonical.exists&&(canonical.data()?.company!==company||canonical.data()?.stationId!==stationId||canonical.data()?.schemaVersion!==2))throw new Error('Canonical document conflict; migration stopped without overwriting it.');
   const old=all.docs.filter(d=>d.data().stationId===stationId&&d.data().schemaVersion!==2);
   if(!old.length)return;
   if(old.length>150)throw new Error('Station has too many contacts for this migration batch.');
   const backups=await tx.getAll(...old.map(d=>db.collection('duty_time_station_contacts_backup').doc(d.id)));
   for(let i=0;i<old.length;i++)if(backups[i].exists&&JSON.stringify(backups[i].data()?.original)!==JSON.stringify(old[i].data()))throw new Error('Existing backup differs; migration stopped.');
   const grouped=groupedContacts(all.docs.map(d=>({id:d.id,data:d.data()})),company,stationId);
   const expected=old.length+Object.keys(canonical.data()?.contacts||{}).length;
   if(Object.keys(grouped.contacts).length!==expected)throw new Error('Contact count mismatch.');
   tx.set(ref,{...grouped,migratedAt:Date.now(),updatedAt:Date.now(),updatedBy:admin.uid});
   for(let i=0;i<old.length;i++){
    if(!backups[i].exists)tx.create(backups[i].ref,{company,stationId,original:old[i].data(),originalId:old[i].id,migratedTo:ref.id,migratedAt:Date.now()});
    tx.delete(old[i].ref);
   }
   tx.create(db.collection('duty_time_admin_audit').doc(),{company,stationId,action:'station_contacts_migrated',actorUid:admin.uid,at:Date.now(),contacts:expected});
  });
 }
 if(apply){const after=await db.collection('duty_time_station_contacts').where('company','==',company).get();const remaining=after.docs.filter(d=>d.data().schemaVersion!==2).length;
 const contactCount=after.docs.reduce((n,d)=>n+Object.keys(d.data().contacts||{}).length,0);
 const backups=await db.collection('duty_time_station_contacts_backup').where('company','==',company).get();
 for(const backup of backups.docs){const value=backup.data();const target=after.docs.find(d=>d.id===value.migratedTo);if(!target)continue;
 const original=value.original;const entries=Object.values(target.data().contacts||{}) as Array<{name:string;email:string;phone:string}>;
 if(!entries.some(c=>c.name===String(original.name||'')&&c.email===String(original.email||'')&&c.phone===String(original.phone||'')))throw new Error('Migrated contact details do not match the backup.');}
 console.log(JSON.stringify({stationDocuments:after.size,contacts:contactCount,legacyRemaining:remaining,backupsVerified:backups.size}));if(remaining)throw new Error('Legacy contacts remain.');}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
