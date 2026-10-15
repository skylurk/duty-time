import { dateKey, dayStart, duration, nextDate, timeLabel, TARGET_MS, TIME_ZONE } from './duty';
export const REST_MS=8*3600000;
/** After a calendar day with more than 12 confirmed hours, 10 hours' rest from the last check-out (same-day breaks included). */
export const LONG_DAY_REST_MS=10*3600000;
/** Hard limit of confirmed duty per station-local calendar day. */
export const DAILY_CAP_MS=20*3600000;

// Minimal day shape shared by duty records and report rows.
type RestSession={start:number;end:number;autoCheckoutPending?:boolean};
type RestDay={date:string;status:string;sessions:RestSession[]};
const counted=(d:RestDay)=>['recorded','pending_checkout'].includes(d.status);
export const confirmedHours=(d:RestDay)=>counted(d)?d.sessions.filter(s=>!s.autoCheckoutPending).reduce((n,s)=>n+s.end-s.start,0):0;

/**
 * The 10-hour rest owed after a day over 12 hours, as seen at `at`. The rest starts at the last check-out of that
 * duty: sessions that follow with less than 10 hours between them (including the next-day piece of a shift crossing
 * midnight) extend it. Returns the latest such requirement, or null when no day over 12 hours precedes `at`.
 */
export function longDayRest(days:RestDay[],at:number){
 const sessions=days.filter(counted).flatMap(d=>d.sessions.filter(s=>!s.autoCheckoutPending)).filter(s=>s.end<=at).sort((a,b)=>a.start-b.start);
 let best:{until:number;lastEnd:number;date:string;total:number}|null=null;
 for(const day of days){
  const total=confirmedHours(day); if(total<=TARGET_MS)continue;
  const ends=day.sessions.filter(s=>!s.autoCheckoutPending&&s.end<=at).map(s=>s.end); if(!ends.length)continue;
  let chain=Math.max(...ends);
  for(const s of sessions){ if(s.end<=chain)continue; if(s.start-chain>=LONG_DAY_REST_MS)break; chain=Math.max(chain,s.end); }
  const until=chain+LONG_DAY_REST_MS;
  if(!best||until>best.until)best={until,lastEnd:chain,date:day.date,total};
 }
 return best;
}

export type RestDenial={eligibleAt:number|null;lastEnd:number;message:string;kind:'long_day'|'new_day'|'unverified'};
/** Why a check-in at `start` is refused for rest, or null when it is allowed. */
export function restDecision(days:RestDay[],start:number,timeZone?:string):RestDenial|null{
 const zone=timeZone||TIME_ZONE;
 const long=longDayRest(days,start);
 if(long&&start<long.until)return {kind:'long_day',eligibleAt:long.until,lastEnd:long.lastEnd,message:`You worked ${duration(long.total)} on ${long.date}, more than 12 hours. You need 10 hours of rest after your last check-out before checking in again. Rest remaining: ${duration(long.until-start)}. You can check in at ${timeLabel(long.until,zone)} (${zone}). Check-in is blocked.`};
 // Ordinary days: 8 hours' rest before a new duty day; breaks within the same day are allowed.
 const today=dateKey(start,zone);
 const previous=days.filter(counted).flatMap(d=>d.sessions).filter(s=>s.start<start).sort((a,b)=>b.end-a.end)[0];
 if(!previous)return null;
 const lastDutyDate=dateKey(Math.max(previous.start,previous.end-1),zone);
 if(lastDutyDate===today)return null;
 if(previous.autoCheckoutPending)return {kind:'unverified',eligibleAt:null,lastEnd:previous.end,message:'Record the actual checkout for your previous duty day before checking in so your rest can be verified.'};
 const eligibleAt=previous.end+REST_MS;
 return start<eligibleAt?{kind:'new_day',eligibleAt,lastEnd:previous.end,message:`You need at least 8 hours of rest before your next duty day. Rest remaining: ${duration(eligibleAt-start)}. You can check in at ${timeLabel(eligibleAt,zone)} (${zone}). Check-in is blocked.`}:null;
}

/** Confirmed hours already recorded on the station-local date of `at`, counting only time before `at`. */
export function hoursOnDate(days:RestDay[],at:number,timeZone?:string){
 const date=dateKey(at,timeZone),from=dayStart(date,timeZone);
 return days.filter(counted).flatMap(d=>d.sessions.filter(s=>!s.autoCheckoutPending)).reduce((n,s)=>n+Math.max(0,Math.min(s.end,at)-Math.max(s.start,from)),0);
}
/**
 * When an open session that starts at `start` must stop so no calendar day passes 20 hours. The first day's allowance
 * is what remains after `before` (hours already on that date); a session running past midnight gets a fresh 20 hours
 * for the next date.
 */
export function dailyCapAt(start:number,before:number,timeZone?:string){
 const firstDayEnd=dayStart(nextDate(dateKey(start,timeZone)),timeZone),capFirst=start+Math.max(0,DAILY_CAP_MS-before);
 return capFirst<=firstDayEnd?capFirst:firstDayEnd+DAILY_CAP_MS;
}
