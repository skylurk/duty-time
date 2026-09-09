require('@next/env').loadEnvConfig(process.cwd());
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
(async()=>{
 const app=initializeApp({credential:cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))});
 const auth=getAuth(app),db=getFirestore(app);
 const user=await auth.getUserByEmail('david@acuvera.com');
 const docs=await db.collection('users_new').where('uid','==',user.uid).get();
 const company=docs.size===1?docs.docs[0].data().company:null;
 const memberships=await db.collection('duty_time_user_data').get();
 const adminMembership=memberships.docs.find(d=>d.id===user.uid);
 console.log(JSON.stringify({initializedMemberships:memberships.size,adminMembershipReady:adminMembership?.data().company===company,sharedProfilesChanged:0}));
 console.log(JSON.stringify({accountFound:true,matchingProfiles:docs.size,hasCompany:!!company,existingDutyAdmin:user.customClaims?.duty_time_admin===true}));
})().catch(error=>{console.error('Setup check failed:',error.code||error.name);process.exitCode=1;});
