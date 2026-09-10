/** Never expose an HTML error page (or its contents) as a JSON parsing error. */
export async function readApiResponse<T>(response:Response,path:string):Promise<T>{
 const location=path.split('?')[0];
 const raw=await response.text();
 let data:unknown;
 try{data=JSON.parse(raw);}catch{
  throw new Error(`DutyTime received an unexpected server response (HTTP ${response.status}, ${location}). Refresh and try again. If this continues, ask your administrator to check the deployment logs.`);
 }
 if(!response.ok){
  const message=data&&typeof data==='object'&&'error' in data&&(typeof data.error==='string')?data.error:'The request could not be completed.';
  throw new Error(message);
 }
 return data as T;
}
