require('@next/env').loadEnvConfig(process.cwd());
const fs = require('node:fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
const credential = cert(account);
const app = initializeApp({ credential });
async function rulesRequest(path, method='GET', body) {
 const { GoogleAuth } = require('google-auth-library');
 const accessToken = await new GoogleAuth({ credentials: account, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getAccessToken();
 const response = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, ...(body?{body:JSON.stringify(body)}:{}), signal:AbortSignal.timeout(30000) });
 const data = await response.json();
 if (!response.ok) throw new Error(`Rules API ${response.status}: ${data.error?.status || 'failed'} — ${data.error?.message || ''}`);
 return data;
}
async function testRules() {
 const content=fs.readFileSync('firestore.rules','utf8');
 const cases=[];
 for(const collection of ['users_new','company','station','position','handover_submissions','preflight_risk_assessments','duty_time_user_data','duty_time_days','duty_time_reports','duty_time_admin_audit']) {
  for(const method of ['get','list','create','update','delete']) {
   for(const signedIn of [true,false]) {
    cases.push({expectation:signedIn&&!collection.startsWith('duty_time_')?'ALLOW':'DENY',request:{path:`/databases/(default)/documents/${collection}/test-only`,method,auth:signedIn?{uid:'test-only'}:null,resource:{data:{}}},resource:{data:{}}});
   }
  }
 }
 // Also cover descendants and the existing users collection's special match.
 for(const path of ['users/test-only','users/another-user','station/test-only/nested/test-only','duty_time_days/test-only/nested/test-only']) for(const method of ['get','update']) cases.push({expectation:path.startsWith('duty_time_')?'DENY':'ALLOW',request:{path:`/databases/(default)/documents/${path}`,method,auth:{uid:'test-only'},resource:{data:{}}},resource:{data:{}}});
 const result=await rulesRequest(`projects/${account.project_id}:test`,'POST',{source:{files:[{name:'firestore.rules',content}]},testSuite:{testCases:cases}});
 const issues=(result.issues||[]).filter(i=>i.severity==='ERROR');
 const failures=(result.testResults||[]).filter(t=>t.state!=='SUCCESS');
 console.log(JSON.stringify({rulesTests:result.testResults?.length||0,failures:failures.length,compileErrors:issues.length,...(issues.length?{issues}:{}),...(failures.length?{failedCases:failures.map(f=>({index:f.testCaseIndex,state:f.state,errors:f.errors}))}:{})}));
 if(issues.length||failures.length||result.testResults?.length!==cases.length)throw new Error('Rules checks did not pass.');
 return content;
}
async function deployRules() {
 const content=await testRules();
 const release=await rulesRequest(`projects/${account.project_id}/releases/cloud.firestore`);
 const current=await rulesRequest(release.rulesetName);
 const previous=fs.readFileSync('docs/firestore.rules.before-duty-time','utf8');
 if(current.source.files[0].content===content){console.log('DutyTime rules already deployed.');return;}
 if(current.source.files[0].content!==previous)throw new Error('Live rules changed since inspection. Refusing to overwrite concurrent changes.');
 const ruleset=await rulesRequest(`projects/${account.project_id}/rulesets`,'POST',{source:{files:[{name:'firestore.rules',content}]}});
 await rulesRequest(`projects/${account.project_id}/releases/cloud.firestore`,'PATCH',{release:{name:`projects/${account.project_id}/releases/cloud.firestore`,rulesetName:ruleset.name}});
 const verify=await rulesRequest(`projects/${account.project_id}/releases/cloud.firestore`);
 if(verify.rulesetName!==ruleset.name)throw new Error('Rules release verification failed.');
 fs.writeFileSync('docs/firebase-setup-status.json',JSON.stringify({rulesDeployedAt:new Date().toISOString(),previousRuleset:release.rulesetName,ruleset:ruleset.name},null,2)+'\n');
 console.log('Deployed and verified rules isolating only duty_time_ collections.');
}
async function seedMemberships() {
 const content=fs.readFileSync('firestore.rules','utf8');
 const release=await rulesRequest(`projects/${account.project_id}/releases/cloud.firestore`);
 const current=await rulesRequest(release.rulesetName);
 if(current.source.files[0].content!==content)throw new Error('Protect DutyTime collections before creating memberships.');
 const db=getFirestore(app), users=await db.collection('users_new').get();
 const grouped=new Map(); for(const doc of users.docs){const u=doc.data();if(typeof u.uid==='string'&&u.uid&&!u.uid.includes('/')&&typeof u.company==='string'&&u.company&&!u.company.includes('/'))grouped.set(u.uid,[...(grouped.get(u.uid)||[]),{...u,__docId:doc.id}]);}
 let created=0,skipped=0;
 for(const [uid,rows] of grouped){const u=rows.find(row=>row.__docId===uid)||(rows.length===1?rows[0]:null);if(!u){skipped++;continue;}await db.runTransaction(async tx=>{const ref=db.collection('duty_time_user_data').doc(uid),snap=await tx.get(ref);if(snap.exists){skipped++;return;}tx.create(ref,{uid,company:u.company,position:String(u.position||''),isLineManager:false,lineManagerUids:[],enabled:true,createdAt:Date.now(),createdBy:'initial-membership-import'});created++;});}
 console.log(JSON.stringify({membershipsCreated:created,membershipsSkipped:skipped,sharedProfilesChanged:0}));
}
async function grantAdmin(email) {
 if(!email)throw new Error('Pass the explicitly authorized administrator email.');
 const auth=getAuth(app), user=await auth.getUserByEmail(email);
 const db=getFirestore(app),profile=await db.collection('users_new').where('uid','==',user.uid).get();
 if(profile.size!==1 || !profile.docs[0].data().company)throw new Error('Administrator needs a unique company profile.');
 await auth.setCustomUserClaims(user.uid,{...(user.customClaims||{}),duty_time_admin:true});
 const updated=await auth.getUser(user.uid);
 if(updated.customClaims?.duty_time_admin!==true)throw new Error('Administrator claim verification failed.');
 console.log('DutyTime administrator claim added; other existing claims preserved.');
}
(async()=>{const command=process.argv[2];if(command==='test-rules')await testRules();else if(command==='deploy-rules')await deployRules();else if(command==='seed-memberships')await seedMemberships();else if(command==='grant-admin')await grantAdmin(process.argv[3]);else throw new Error('Choose test-rules, deploy-rules, seed-memberships, or grant-admin.');})().catch(e=>{console.error(e.message);process.exitCode=1;});
