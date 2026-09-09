require('@next/env').loadEnvConfig(process.cwd());
const {execFileSync}=require('node:child_process');
try{const raw=execFileSync('firebase',['projects:list','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:45000});const data=JSON.parse(raw);const list=Array.isArray(data.result)?data.result:data.result?.projects||[];console.log(JSON.stringify({status:data.status,configuredProjectAccessible:list.some(p=>p.projectId===process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)}));}catch{console.log('Firebase CLI project access could not be verified.');process.exitCode=1;}
