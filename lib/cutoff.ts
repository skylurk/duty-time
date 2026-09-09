import { dateKey, parseTime, nextDate, dayStart, DAY_MS, splitSession, validateSessions, type Active, type DutyDay, type Session } from './duty';
export const DEFAULT_CUTOFF = '19:00';
export const validCutoff = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function cutoffFor(start: number, override?: string | null, timeZone?: string) {
  const clock = validCutoff(override) ? override : DEFAULT_CUTOFF;
  const sameDay = parseTime(dateKey(start,timeZone), clock,timeZone);
  return { cutoffAt: sameDay > start ? sameDay : parseTime(nextDate(dateKey(start,timeZone)),clock,timeZone), cutoffTime: clock };
}
export function recordedStatus(sessions: Session[]): DutyDay['status'] {
  return sessions.some(s => s.autoCheckoutPending) ? 'pending_checkout' : 'recorded';
}
export type AutoCheckout = { id: string; uid: string; company: string; active: Active; cutoffAt: number; processedAt: number; pending: boolean; affectedDates: string[]; actualEnd?: number; resolvedAt?: number; resolvedBy?: string };
export function automaticPieces(active: Active, cutoffAt: number, id: string) {
  return splitSession(active, cutoffAt).map(p=>({date:p.date,session:{...p.session,autoCheckoutId:id,autoCheckoutAt:cutoffAt,autoCheckoutPending:true}}));
}
export function correctionDates(record: AutoCheckout, end: number) {
  if (!Number.isFinite(end) || end <= record.active.start) throw new Error('Actual checkout must be after check-in.');
  if (end - record.active.start > 31 * DAY_MS) throw new Error('An actual duty session cannot span more than 31 days.');
  return [...new Set([...record.affectedDates,...splitSession(record.active,end).map(p=>p.date)])].sort();
}
export function correctedDays(record: AutoCheckout, existing: DutyDay[], end: number, now: number, currentActive: Active | null) {
  if (!record.pending) throw new Error('The actual checkout has already been recorded. Refresh this day.');
  if (end > now) throw new Error('Actual checkout cannot be in the future.');
  if (currentActive && end > currentActive.start) throw new Error('Actual checkout overlaps your current open session.');
  const pieces=splitSession(record.active,end);
  return correctionDates(record,end).map(date=>{
    const original=existing.find(d=>d.date===date);
    if(original?.status==='pending'||original?.status==='rejected')throw new Error('Actual checkout conflicts with a missed-entry request on this date.');
    const day: DutyDay=original?structuredClone(original):{id:`${record.uid}_${date}`,uid:record.uid,company:record.company,date,sessions:[],status:'recorded',reason:'',closed:false,audit:[],revision:0};
    if(day.company!==record.company||day.uid!==record.uid)throw new Error('Duty record membership does not match.');
    const others=day.sessions.filter(s=>s.autoCheckoutId!==record.id);
    const piece=pieces.find(p=>p.date===date);
    day.sessions=piece?[...others,{...piece.session,autoCheckoutId:record.id,autoCheckoutPending:false}]:others;
    day.sessions.sort((a,b)=>a.start-b.start);
    validateSessions(day.sessions,date,now);
    day.status=recordedStatus(day.sessions);
    return day;
  });
}

export function canCheckIn(now: number, override?: string | null, timeZone?: string) {
  return now < parseTime(dateKey(now,timeZone), validCutoff(override) ? override : DEFAULT_CUTOFF,timeZone);
}
