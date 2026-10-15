import { NextRequest, NextResponse } from 'next/server';
import { adminServices } from '@/lib/firebase/admin';
import { authenticate, companyProfiles, apiError, fail } from '@/lib/server/access';
import { dateKey, DAY_MS, type DutyDay } from '@/lib/duty';
import type { ReportActive, ReportData, ReportDay } from '@/lib/reports';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, MAX_DAYS = 366;
const compact = (d: DutyDay): ReportDay => ({ uid: d.uid, date: d.date, status: d.status, sessions: (d.sessions || []).map(s => ({ start: s.start, end: s.end, station: s.station, stationId: s.stationId, timeZone: s.timeZone, ...(s.autoCheckoutPending ? { autoCheckoutPending: true } : {}) })) });
// Company-wide duty data for the admin calendar and reports. Range filtering uses the single-field `date` index; company is filtered here.
export async function GET(request: NextRequest) {
  try {
    const actor = await authenticate(request); fail(actor.isAdmin, 'Administrator access is required.', 403);
    const from = request.nextUrl.searchParams.get('from') || '', to = request.nextUrl.searchParams.get('to') || '';
    fail(DATE.test(from) && DATE.test(to) && from <= to, 'Choose a valid date range.');
    fail((Date.parse(to) - Date.parse(from)) / DAY_MS < MAX_DAYS, 'Choose a range of one year or less.');
    const { db } = adminServices(), company = actor.profile.company, now = Date.now();
    const recentFrom = dateKey(now - 8 * DAY_MS, 'UTC');
    const [range, recent, states, people, companyDoc] = await Promise.all([
      db.collection('duty_time_days').where('date', '>=', from).where('date', '<=', to).get(),
      db.collection('duty_time_days').where('date', '>=', recentFrom).get(),
      db.collection('duty_time_state').where('company', '==', company).get(),
      companyProfiles(company),
      db.collection('company').doc(company).get(),
    ]);
    const mine = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => docs.map(d => d.data() as DutyDay).filter(d => d.company === company).map(compact);
    const active: ReportActive[] = states.docs.map(d => ({ uid: d.id, a: d.data().active })).filter(x => x.a).map(({ uid, a }) => ({ uid, start: a.start, station: a.station, timeZone: a.timeZone, ...(a.cutoffAt ? { cutoffAt: a.cutoffAt } : {}) }));
    const body: ReportData = { from, to, generatedAt: now, companyName: companyDoc.data()?.company_name || 'Your company', people: people.map(p => ({ uid: p.uid, name: p.name, position: p.position, department: p.department, enabled: p.enabled })), days: mine(range.docs), recent: mine(recent.docs), active };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}
