import 'server-only';
import { FieldPath } from 'firebase-admin/firestore';
import { adminServices } from '@/lib/firebase/admin';
import { dayStart, DAY_MS, type DutyDay, type Station, type Settings, TIME_ZONE, validTimeZone } from '@/lib/duty';
import { fail } from './access';
export const dayId = (uid: string, date: string) => `${uid}_${date}`;
export function blankDay(uid: string, company: string, date: string): DutyDay { return { id: dayId(uid, date), uid, company, date, sessions: [], status: 'recorded', reason: '', closed: false, audit: [], revision: 0 }; }
export async function getSettings(company: string): Promise<Settings> { const doc = await adminServices().db.collection('duty_time_settings').doc(company).get(); return { allowManualTimes: doc.data()?.allowManualTimes === true, alertEmails: Array.isArray(doc.data()?.alertEmails)?doc.data()!.alertEmails:[] }; }
export async function getStations(company: string): Promise<Station[]> {
  const { db } = adminServices();
  const [shared, custom] = await Promise.all([db.collection('station').get(), db.collection('duty_time_stations').where('company', '==', company).get()]);
  const map = new Map<string, Station>();
  for (const doc of shared.docs) { const data = doc.data(); if (data.company && data.company !== company) continue; map.set(doc.id, { id: doc.id, name: String(data.name || ''), country: String(data.country || ''), active: true, source: 'shared', timeZone: validTimeZone(data.timeZone||'')?data.timeZone:TIME_ZONE }); }
  for (const doc of custom.docs) { const data = doc.data(); const id = String(data.sharedStationId || doc.id); map.set(id, { id, name: String(data.name || ''), country: String(data.country || ''), active: data.active !== false, source: data.sharedStationId ? 'shared' : 'duty', timeZone: validTimeZone(data.timeZone||'')?data.timeZone:map.get(id)?.timeZone||TIME_ZONE }); }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export async function getMonthDays(uid: string, month: string): Promise<DutyDay[]> {
  fail(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), 'Choose a valid month.');
  const docs = await adminServices().db.collection('duty_time_days').orderBy(FieldPath.documentId()).startAt(dayId(uid, `${month}-01`)).endAt(dayId(uid, `${month}-31`)).get();
  return docs.docs.filter(d => d.data().uid === uid && String(d.data().date).startsWith(`${month}-`)).map(d => ({ ...(d.data() as DutyDay), id: d.id, audit: [] }));
}
export function previousDate(date: string) { return new Date(dayStart(date) - DAY_MS + 12 * 3600000).toISOString().slice(0, 10); }
