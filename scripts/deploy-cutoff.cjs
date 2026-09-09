// Run only after explicit approval to activate production automatic checkouts and emails.
require('@next/env').loadEnvConfig(process.cwd());
const {spawnSync}=require('node:child_process');
const project=process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,key=process.env.RESEND_API_KEY,sender=process.env.RESEND_FROM_EMAIL;
if(!project||!key||!sender)throw new Error('Firebase project and Resend settings are required.');
function cli(args,input){const result=spawnSync('firebase',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:900000});let output=(result.stdout||'')+(result.stderr||'');for(const secret of [key,sender])output=output.split(secret).join('[redacted]');process.stdout.write(output);if(result.status!==0)throw new Error(`Firebase command failed: ${args[0]}`);}
try{
 for(const [name,value]of [['DUTY_TIME_RESEND_API_KEY',key],['DUTY_TIME_RESEND_FROM_EMAIL',sender]])cli(['functions:secrets:set',name,'--data-file','-','--project',project,'--non-interactive'],value);
 cli(['deploy','--only','functions:duty-time','--project',project,'--non-interactive']);
 console.log('DutyTime scheduled cutoff deployment completed.');
}catch(error){console.error(error.message);process.exitCode=1;}
