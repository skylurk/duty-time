import { dateKey, dayStart, duration, DAY_MS, TARGET_MS, nextDate } from './duty';
import { REST_MS, DAILY_CAP_MS, longDayRest } from './rest';

// Compact shapes returned by /api/reports. Dates are station-local duty dates, as stored on duty days.
export type ReportSession = { start: number; end: number; station: string; stationId: string; timeZone?: string; autoCheckoutPending?: boolean };
export type ReportDay = { uid: string; date: string; status: string; sessions: ReportSession[] };
export type ReportPerson = { uid: string; name: string; position: string; department: string; enabled: boolean };
export type ReportActive = { uid: string; start: number; station: string; timeZone?: string; cutoffAt?: number };
export type ReportData = { from: string; to: string; generatedAt: number; companyName: string; people: ReportPerson[]; days: ReportDay[]; recent: ReportDay[]; active: ReportActive[] };

export const HIGH_LOAD_HOURS = 60, HIGH_LOAD_OVERTIME_DAYS = 2, APPROACHING_MS = 10 * 3_600_000;

/** Confirmed hours for a day, matching totalForDay: pending/rejected days and provisional sessions do not count. */
export function confirmedTotal(day: ReportDay) {
  return ['recorded', 'pending_checkout'].includes(day.status) ? day.sessions.filter(s => !s.autoCheckoutPending).reduce((n, s) => n + s.end - s.start, 0) : 0;
}
export const overtimeFor = (day: ReportDay) => Math.max(0, confirmedTotal(day) - TARGET_MS);
const stationsOf = (day: ReportDay) => [...new Set(day.sessions.map(s => s.station))];
/** The station where most of the day's time was worked; overtime is attributed there. */
function mainStation(day: ReportDay) {
  const hours = new Map<string, number>();
  for (const s of day.sessions) hours.set(s.station, (hours.get(s.station) || 0) + s.end - s.start);
  return [...hours].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown station';
}
export function personName(people: ReportPerson[], uid: string) { return people.find(p => p.uid === uid)?.name || 'Former member'; }

export type OvertimeDay = { date: string; total: number; overtime: number; stations: string[]; firstStart: number; lastEnd: number; timeZone?: string };
export type OvertimePerson = { uid: string; name: string; position: string; days: OvertimeDay[]; overtime: number };
export function overtimeReport(days: ReportDay[], people: ReportPerson[]): OvertimePerson[] {
  const byPerson = new Map<string, OvertimePerson>();
  for (const day of days) {
    const total = confirmedTotal(day), overtime = total - TARGET_MS;
    if (overtime <= 0) continue;
    const person = people.find(p => p.uid === day.uid);
    const row = byPerson.get(day.uid) || { uid: day.uid, name: person?.name || 'Former member', position: person?.position || '', days: [], overtime: 0 };
    const counted = day.sessions.filter(s => !s.autoCheckoutPending);
    row.days.push({ date: day.date, total, overtime, stations: stationsOf(day), firstStart: Math.min(...counted.map(s => s.start)), lastEnd: Math.max(...counted.map(s => s.end)), timeZone: counted[0]?.timeZone });
    row.overtime += overtime; byPerson.set(day.uid, row);
  }
  for (const row of byPerson.values()) row.days.sort((a, b) => a.date.localeCompare(b.date));
  return [...byPerson.values()].sort((a, b) => b.overtime - a.overtime || a.name.localeCompare(b.name));
}

export type DayEntry = { uid: string; name: string; position: string; total: number; overtime: number; stations: string[]; sessions: ReportSession[]; status: string; pending: number };
/** Everyone's hours for one date, longest first. Days with no confirmed or provisional time are omitted. */
export function dayBreakdown(days: ReportDay[], people: ReportPerson[], date: string): DayEntry[] {
  return days.filter(d => d.date === date).map(d => {
    const p = people.find(x => x.uid === d.uid), total = confirmedTotal(d);
    return { uid: d.uid, name: p?.name || 'Former member', position: p?.position || '', total, overtime: Math.max(0, total - TARGET_MS), stations: stationsOf(d), sessions: [...d.sessions].sort((a, b) => a.start - b.start), status: d.status, pending: d.sessions.filter(s => s.autoCheckoutPending).reduce((n, s) => n + s.end - s.start, 0) };
  }).filter(e => e.total > 0 || e.pending > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
export function calendarSummary(days: ReportDay[]) {
  const out = new Map<string, { people: number; total: number; overtimePeople: number }>();
  for (const d of days) {
    const total = confirmedTotal(d), pending = d.sessions.some(s => s.autoCheckoutPending);
    if (!total && !pending) continue;
    const row = out.get(d.date) || { people: 0, total: 0, overtimePeople: 0 };
    row.people++; row.total += total; if (total > TARGET_MS) row.overtimePeople++;
    out.set(d.date, row);
  }
  return out;
}

function mondayOf(date: string) { const d = new Date(`${date}T12:00:00Z`); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10); }
export type TrendBucket = { key: string; label: string; regular: number; overtime: number; people: number; overtimePeople: number };
/** Hours over time: daily buckets for ranges up to 45 days, otherwise weekly (Monday start). */
export function trendBuckets(days: ReportDay[], from: string, to: string): { unit: 'day' | 'week'; buckets: TrendBucket[] } {
  const span = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS) + 1, unit = span > 45 ? 'week' : 'day';
  const buckets = new Map<string, TrendBucket & { uids: Set<string>; otUids: Set<string> }>();
  for (let d = unit === 'week' ? mondayOf(from) : from; d <= to; d = unit === 'week' ? new Date(Date.parse(`${d}T12:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10) : nextDate(d)) {
    const label = new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
    buckets.set(d, { key: d, label: unit === 'week' ? `w/c ${label}` : label, regular: 0, overtime: 0, people: 0, overtimePeople: 0, uids: new Set(), otUids: new Set() });
  }
  for (const day of days) {
    const b = buckets.get(unit === 'week' ? mondayOf(day.date) : day.date), total = confirmedTotal(day);
    if (!b || !total) continue;
    b.regular += Math.min(total, TARGET_MS); b.overtime += Math.max(0, total - TARGET_MS); b.uids.add(day.uid); if (total > TARGET_MS) b.otUids.add(day.uid);
  }
  return { unit, buckets: [...buckets.values()].map(({ uids, otUids, ...b }) => ({ ...b, people: uids.size, overtimePeople: otUids.size })) };
}
export function trendTotals(days: ReportDay[]) {
  let hours = 0, overtime = 0, workedDays = 0, overtimeDays = 0; const people = new Set<string>(), overtimePeople = new Set<string>();
  for (const d of days) { const t = confirmedTotal(d); if (!t) continue; hours += t; workedDays++; people.add(d.uid); if (t > TARGET_MS) { overtime += t - TARGET_MS; overtimeDays++; overtimePeople.add(d.uid); } }
  return { hours, overtime, workedDays, overtimeDays, people: people.size, overtimePeople: overtimePeople.size, averageDay: workedDays ? hours / workedDays : 0 };
}
export function overtimeByStation(days: ReportDay[]) {
  const out = new Map<string, { overtime: number; days: number }>();
  for (const d of days) { const ot = overtimeFor(d); if (!ot) continue; const s = mainStation(d), row = out.get(s) || { overtime: 0, days: 0 }; row.overtime += ot; row.days++; out.set(s, row); }
  return [...out].map(([station, v]) => ({ station, ...v })).sort((a, b) => b.overtime - a.overtime);
}

export type RestRow = { uid: string; name: string; position: string; kind: 'over' | 'approaching' | 'resting' | 'awaiting'; station: string; timeZone?: string; since: number; until?: number; today?: number; longRest?: boolean };
/**
 * Who needs rest right now. "over"/"approaching": on duty with today's hours above 12h / 10h.
 * "resting": off duty and not yet eligible for a new duty day (8h after their last checkout).
 * "awaiting": last duty ended with an automatic checkout that still needs the actual time, so rest cannot be verified.
 */
export function restWatch(recent: ReportDay[], active: ReportActive[], people: ReportPerson[], now = Date.now()): RestRow[] {
  const rows: RestRow[] = [];
  const person = (uid: string) => people.find(p => p.uid === uid);
  for (const a of active) {
    const p = person(a.uid); if (!p) continue;
    const today = dateKey(now, a.timeZone), end = Math.min(now, a.cutoffAt ?? now);
    const recorded = recent.filter(d => d.uid === a.uid && d.date === today).reduce((n, d) => n + confirmedTotal(d), 0);
    const total = recorded + Math.max(0, end - Math.max(a.start, dayStart(today, a.timeZone)));
    if (total >= APPROACHING_MS) rows.push({ uid: a.uid, name: p.name, position: p.position, kind: total > TARGET_MS ? 'over' : 'approaching', station: a.station, timeZone: a.timeZone, since: a.start, today: total });
  }
  const activeIds = new Set(active.map(a => a.uid));
  const sessionsBy = new Map<string, ReportSession[]>();
  for (const d of recent) if (['recorded', 'pending_checkout'].includes(d.status)) sessionsBy.set(d.uid, [...(sessionsBy.get(d.uid) || []), ...d.sessions]);
  for (const [uid, sessions] of sessionsBy) {
    const p = person(uid); if (!p || activeIds.has(uid)) continue;
    const last = sessions.sort((a, b) => b.end - a.end)[0]; if (!last || last.end > now) continue;
    if (last.autoCheckoutPending) rows.push({ uid, name: p.name, position: p.position, kind: 'awaiting', station: last.station, timeZone: last.timeZone, since: last.end });
    else {
      // After a day over 12 hours the rest is 10 hours and blocks any check-in; otherwise 8 hours before a new duty day.
      const long = longDayRest(recent.filter(d => d.uid === uid), now);
      if (long && long.until > now) rows.push({ uid, name: p.name, position: p.position, kind: 'resting', station: last.station, timeZone: last.timeZone, since: long.lastEnd, until: long.until, longRest: true });
      else if (last.end + REST_MS > now) rows.push({ uid, name: p.name, position: p.position, kind: 'resting', station: last.station, timeZone: last.timeZone, since: last.end, until: last.end + REST_MS });
    }
  }
  const order = { over: 0, approaching: 1, awaiting: 2, resting: 3 };
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || (b.today || 0) - (a.today || 0) || (a.until || 0) - (b.until || 0));
}
export type LoadRow = { uid: string; name: string; position: string; hours: number; overtimeDays: number; flagged: boolean };
/** Hours over the last 7 station-local days, flagged at 60h or two or more overtime days. */
export function weeklyLoad(recent: ReportDay[], people: ReportPerson[], now = Date.now()): LoadRow[] {
  const since = dateKey(now - 6 * DAY_MS, 'UTC');
  const out = new Map<string, LoadRow>();
  for (const d of recent) {
    if (d.date < since) continue;
    const t = confirmedTotal(d); if (!t) continue;
    const p = people.find(x => x.uid === d.uid);
    const row = out.get(d.uid) || { uid: d.uid, name: p?.name || 'Former member', position: p?.position || '', hours: 0, overtimeDays: 0, flagged: false };
    row.hours += t; if (t > TARGET_MS) row.overtimeDays++; out.set(d.uid, row);
  }
  return [...out.values()].map(r => ({ ...r, flagged: r.hours >= HIGH_LOAD_HOURS * 3_600_000 || r.overtimeDays >= HIGH_LOAD_OVERTIME_DAYS })).sort((a, b) => b.hours - a.hours);
}

export type LimitException = { uid: string; name: string; date: string; kind: 'over_cap' | 'short_rest'; detail: string; at: number; timeZone?: string };
/**
 * Records that break the duty limits, which only manager corrections, approved missed entries or actual checkouts can
 * create: days over 20 confirmed hours, and sessions started inside the 10-hour rest after a day over 12 hours.
 * The next-day piece of a shift crossing midnight starts exactly where the previous piece ended and is not a breach.
 */
export function limitExceptions(days: ReportDay[], people: ReportPerson[]): LimitException[] {
  const out: LimitException[] = [], byPerson = new Map<string, ReportDay[]>();
  for (const d of days) byPerson.set(d.uid, [...(byPerson.get(d.uid) || []), d]);
  for (const [uid, mine] of byPerson) {
    const name = personName(people, uid);
    for (const d of mine) { const t = confirmedTotal(d); if (t > DAILY_CAP_MS) out.push({ uid, name, date: d.date, kind: 'over_cap', detail: `${duration(t)} recorded, over the 20-hour daily limit`, at: Math.max(...d.sessions.map(s => s.end)), timeZone: d.sessions[0]?.timeZone }); }
    const sessions = mine.filter(d => ['recorded', 'pending_checkout'].includes(d.status)).flatMap(d => d.sessions.filter(s => !s.autoCheckoutPending).map(s => ({ ...s, date: d.date })));
    for (const s of sessions) {
      if (sessions.some(o => o.end === s.start)) continue;
      const rest = longDayRest(mine, s.start);
      if (rest && rest.until > s.start) out.push({ uid, name, date: s.date, kind: 'short_rest', detail: `Started ${duration(s.start - rest.lastEnd)} after the last check-out; 10 hours were required after ${duration(rest.total)} on ${rest.date}`, at: s.start, timeZone: s.timeZone });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}
