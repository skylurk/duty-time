export const TIME_ZONE = 'Africa/Nairobi';
export const DAY_MS = 86_400_000;
export const TARGET_MS = 12 * 3_600_000;
const dateFormats=new Map<string,Intl.DateTimeFormat>(),timeFormats=new Map<string,Intl.DateTimeFormat>();
export function validTimeZone(zone: string): boolean { try { new Intl.DateTimeFormat('en', {timeZone:zone}).format(); return true; } catch { return false; } }
export function dateKey(value: number | Date = Date.now(), timeZone = TIME_ZONE): string {
  let fmt=dateFormats.get(timeZone);if(!fmt){fmt=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});dateFormats.set(timeZone,fmt);}return fmt.format(value);
}
export function timeLabel(value: number, timeZone = TIME_ZONE): string {
  let fmt=timeFormats.get(timeZone);if(!fmt){fmt=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});timeFormats.set(timeZone,fmt);}return fmt.format(value);
}
export function zuluLabel(value:number) { return new Date(value).toISOString().replace('T',' ').replace('.000Z','Z'); }
export function nextDate(date:string):string { return new Date(Date.parse(date+'T12:00:00Z')+DAY_MS).toISOString().slice(0,10); }
export function parseTime(date: string, time: string, timeZone = TIME_ZONE): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !validTimeZone(timeZone)) throw new Error('Choose a valid date, time and station time zone.');
  const wall=Date.parse(`${date}T${time}:00Z`);
  if(!Number.isFinite(wall))throw new Error('Choose a valid date.');
  const offsets=new Set<number>();
  for(const delta of [-DAY_MS,0,DAY_MS]){const t=wall+delta;const local=Date.parse(`${dateKey(t,timeZone)}T${timeLabel(t,timeZone)}:00Z`);offsets.add(local-t);}
  const matches=[...offsets].map(offset=>wall-offset).filter(t=>dateKey(t,timeZone)===date&&timeLabel(t,timeZone)===time);
  if(matches.length!==1)throw new Error('Choose a valid, unambiguous local time; this time falls in a daylight-saving transition or invalid date.');
  return matches[0];
}
export function dayStart(date: string, timeZone = TIME_ZONE): number { return parseTime(date, '00:00', timeZone); }
export function duration(ms: number): string { return `${Math.floor(Math.max(0, ms) / 3600000)}h ${Math.floor(Math.max(0, ms) % 3600000 / 60000)}m`; }
export type Session = { timeZone?: string; autoCheckoutAt?: number; autoCheckoutId?: string; autoCheckoutPending?: boolean; id: string; start: number; end: number; stationId: string; station: string; notes: string };
export type Active = Omit<Session, 'end'> & { date: string; cutoffAt?: number; cutoffTime?: string };
export type Audit = { actorUid: string; actorName: string; at: number; reason: string; before: Session[]; after: Session[]; action: string };
export type DutyDay = { id: string; uid: string; company: string; date: string; sessions: Session[]; status: 'recorded' | 'pending' | 'rejected' | 'pending_checkout'; reason: string; closed: boolean; audit: Audit[]; revision: number };
export type Profile = { cutoffTime?: string | null; uid: string; company: string; firstName: string; lastName: string; name: string; email: string; department: string; position: string; photo: string; isLineManager: boolean; lineManagerUids: string[]; enabled: boolean };
export type Station = { id: string; name: string; active: boolean; source: 'shared' | 'duty'; country?: string; timeZone?: string };
export type StationContact = { active?:boolean; id:string; stationId:string; name:string; email:string; phone:string };
export type Settings = { allowManualTimes: boolean; alertEmails?: string[] };
export type DutyData = { timeZone?:string; lastStationId?:string; pendingAutoCheckouts?: {id:string;date:string;cutoffAt:number}[]; month: string; todayDay: DutyDay | null; profile: Profile; isAdmin: boolean; managers: { uid: string; name: string }[]; stations: Station[]; days: DutyDay[]; active: Active | null; settings: Settings; companyName: string; team: Profile[]; reportDeliveryReady: boolean; reporting: { queued: number; failed: number; blocked: number } };
export function totalForDay(day: DutyDay | undefined) { return day && ['recorded', 'pending_checkout'].includes(day.status) ? day.sessions.filter(s => !s.autoCheckoutPending).reduce((sum, s) => sum + s.end - s.start, 0) : 0; }
export function overtimeForDays(days: DutyDay[]) { return days.reduce((sum, day) => sum + Math.max(0, totalForDay(day) - TARGET_MS), 0); }
export function validateSessions(sessions: Session[], date: string, now = Date.now()) {
  const sorted = [...sessions].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start || s.end > now) throw new Error('Each session must end after it starts and cannot be in the future.');
    if (dateKey(s.start,s.timeZone) !== date || s.end > dayStart(nextDate(date),s.timeZone)) throw new Error('Session times must fall within the selected day.');
    if (i && sorted[i - 1].end > s.start) throw new Error('Duty sessions cannot overlap.');
  }
}
export function splitSession(active: Active, end: number): { date: string; session: Session }[] {
  if (end <= active.start) throw new Error('Check-out must be after check-in.');
  const pieces: { date: string; session: Session }[] = [];
  for (let start = active.start; start < end;) {
    const date = dateKey(start,active.timeZone), stop = Math.min(dayStart(nextDate(date),active.timeZone), end);
    pieces.push({ date, session: { id: `${active.id}_${date}`, timeZone: active.timeZone || TIME_ZONE, start, end: stop, stationId: active.stationId, station: active.station, notes: active.notes } });
    start = stop;
  }
  return pieces;
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Derive the timer from the persisted start, never from the number of UI ticks. */
export function dutyTimer(active: Active | null, todayDay: DutyDay | null | undefined, now = Date.now()) {
  const today = dateKey(now,active?.timeZone);
  const countingUntil = active?.cutoffAt ? Math.min(now, active.cutoffAt) : now;
  const sessionElapsed = active ? Math.max(0, countingUntil - active.start) : 0;
  const activeToday = active ? Math.max(0, countingUntil - Math.max(active.start, dayStart(today,active?.timeZone))) : 0;
  const todayTotal = (todayDay?.date === today ? totalForDay(todayDay) : 0) + activeToday;
  return { sessionElapsed, todayTotal, displayTotal: active ? sessionElapsed : todayTotal };
}
