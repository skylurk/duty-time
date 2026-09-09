import { dateKey, duration, type DutyDay } from './duty';
export const REST_MS=8*3600000;
/** Rest applies across local duty dates, not to breaks within the same duty day. */
export function restDecision(days:DutyDay[],start:number,timeZone?:string){
 const today=dateKey(start,timeZone);
 const sessions=days.filter(d=>['recorded','pending_checkout'].includes(d.status)).flatMap(d=>d.sessions);
 const previous=sessions.filter(s=>s.start<start).sort((a,b)=>b.end-a.end)[0];
 if(!previous)return null;
 const lastDutyDate=dateKey(Math.max(previous.start,previous.end-1),timeZone);
 if(lastDutyDate===today)return null;
 if(previous.autoCheckoutPending)return {eligibleAt:null,lastEnd:previous.end,message:'Record the actual checkout for your previous duty day before checking in so your 8-hour rest can be verified.'};
 const eligibleAt=previous.end+REST_MS;
 return start<eligibleAt?{eligibleAt,lastEnd:previous.end,message:`You need at least 8 hours of rest before your next duty day. Rest remaining: ${duration(eligibleAt-start)}. Check-in is blocked.`}:null;
}
