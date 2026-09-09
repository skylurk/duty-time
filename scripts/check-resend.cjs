require('@next/env').loadEnvConfig(process.cwd());
(async()=>{
 const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
 if(!key||!from)throw new Error('Resend settings are incomplete.');
 const address=(from.match(/<([^>]+)>/)?.[1]||from).trim();
 const domain=address.split('@')[1];
 const response=await fetch('https://api.resend.com/domains',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
 if(!response.ok){const error=await response.json();console.log(JSON.stringify({configurationPresent:true,domainLookupStatus:response.status,errorName:error.name,errorMessage:error.message,emailsSent:0}));return;}
 const result=await response.json(),sender=(result.data||[]).find(d=>d.name===domain);
 console.log(JSON.stringify({configurationPresent:true,senderDomainFound:!!sender,senderDomainVerified:sender?.status==='verified',emailsSent:0}));
})().catch(()=>{console.error('Resend read-only configuration check failed. No email was sent.');process.exitCode=1;});
