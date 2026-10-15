import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTime } from '../lib/duty';
import { overtimeReport, dayBreakdown, calendarSummary, trendBuckets, trendTotals, overtimeByStation, restWatch, weeklyLoad, limitExceptions, type ReportDay, type ReportPerson } from '../lib/reports';
const h = 3_600_000;
const people: ReportPerson[] = [
  { uid: 'a', name: 'Johnson Muyingo', position: 'Engineer', department: 'Maintenance', enabled: true },
  { uid: 'b', name: 'Sammy Ochola', position: 'Technician', department: 'Maintenance', enabled: true },
];
function day(uid: string, date: string, from: string, to: string, extra: Partial<ReportDay> = {}, station = 'Nairobi'): ReportDay {
  return { uid, date, status: 'recorded', sessions: [{ start: parseTime(date, from), end: parseTime(date, to), station, stationId: station, timeZone: 'Africa/Nairobi' }], ...extra };
}

test('overtime report lists only days above 12 hours, grouped by person and sorted by overtime', () => {
  const rows = overtimeReport([day('a', '2026-10-01', '06:00', '19:30'), day('a', '2026-10-02', '06:00', '17:00'), day('b', '2026-10-01', '05:00', '18:00'), day('a', '2026-10-03', '06:00', '18:15')], people);
  assert.deepEqual(rows.map(r => [r.name, r.days.map(d => d.date), r.overtime / 60000]), [['Johnson Muyingo', ['2026-10-01', '2026-10-03'], 105], ['Sammy Ochola', ['2026-10-01'], 60]]);
  assert.equal(rows[0].days[0].total, 13.5 * h);
});

test('pending, rejected and provisional time never counts as overtime', () => {
  const pending = day('a', '2026-10-01', '05:00', '19:00', { status: 'pending' });
  const provisional = day('b', '2026-10-01', '05:00', '19:00', { status: 'pending_checkout' }); provisional.sessions[0].autoCheckoutPending = true;
  assert.deepEqual(overtimeReport([pending, provisional, day('a', '2026-10-02', '05:00', '19:00', { status: 'rejected' })], people), []);
  assert.deepEqual(dayBreakdown([provisional], people, '2026-10-01').map(e => [e.total, e.pending]), [[0, 14 * h]]);
});

test('day breakdown and calendar summary mark who went over 12 hours', () => {
  const days = [day('a', '2026-10-01', '06:00', '19:30'), day('b', '2026-10-01', '08:00', '16:00')];
  assert.deepEqual(dayBreakdown(days, people, '2026-10-01').map(e => [e.name, e.overtime / h]), [['Johnson Muyingo', 1.5], ['Sammy Ochola', 0]]);
  assert.deepEqual(calendarSummary(days).get('2026-10-01'), { people: 2, total: 21.5 * h, overtimePeople: 1 });
});

test('trends use daily buckets for short ranges and weekly buckets beyond 45 days', () => {
  const days = [day('a', '2026-10-01', '06:00', '19:30'), day('b', '2026-10-01', '08:00', '16:00')];
  const daily = trendBuckets(days, '2026-10-01', '2026-10-31');
  assert.equal(daily.unit, 'day'); assert.equal(daily.buckets.length, 31);
  assert.deepEqual([daily.buckets[0].regular / h, daily.buckets[0].overtime / h, daily.buckets[0].overtimePeople], [20, 1.5, 1]);
  const weekly = trendBuckets(days, '2026-08-01', '2026-10-31');
  assert.equal(weekly.unit, 'week'); assert.equal(weekly.buckets[0].key, '2026-07-27');
  assert.equal(weekly.buckets.find(b => b.key === '2026-09-28')!.overtime, 1.5 * h);
  assert.deepEqual(trendTotals(days), { hours: 21.5 * h, overtime: 1.5 * h, workedDays: 2, overtimeDays: 1, people: 2, overtimePeople: 1, averageDay: 10.75 * h });
});

test('station overtime is attributed to the station with most of the day', () => {
  const split: ReportDay = { uid: 'a', date: '2026-10-01', status: 'recorded', sessions: [
    { start: parseTime('2026-10-01', '05:00'), end: parseTime('2026-10-01', '07:00'), station: 'Juba', stationId: 'j' },
    { start: parseTime('2026-10-01', '07:30'), end: parseTime('2026-10-01', '19:00'), station: 'Nairobi', stationId: 'n' }] };
  assert.deepEqual(overtimeByStation([split]), [{ station: 'Nairobi', overtime: 1.5 * h, days: 1 }]);
});

test('rest watch flags long active duty, resting staff, and unverifiable rest', () => {
  const now = parseTime('2026-10-02', '12:00');
  const recent = [day('a', '2026-10-02', '01:00', '06:00'), day('b', '2026-10-01', '06:00', '20:00')];
  const pendingDay = day('c', '2026-10-01', '06:00', '19:00', { status: 'pending_checkout' }); pendingDay.sessions[0].autoCheckoutPending = true;
  const all = [...people, { uid: 'c', name: 'Brian Ogaba', position: 'Engineer', department: 'Maintenance', enabled: true }];
  const rows = restWatch([...recent, pendingDay], [{ uid: 'a', start: parseTime('2026-10-02', '06:30'), station: 'Nairobi', timeZone: 'Africa/Nairobi' }], all, now);
  assert.deepEqual(rows.map(r => [r.name, r.kind]), [['Johnson Muyingo', 'approaching'], ['Brian Ogaba', 'awaiting']]);
  assert.equal(rows[0].today, 10.5 * h);
  const resting = restWatch(recent, [], all, parseTime('2026-10-02', '03:00'));
  assert.deepEqual(resting.map(r => [r.name, r.kind, r.until === parseTime('2026-10-02', '06:00')]), [['Sammy Ochola', 'resting', true]]);
});

test('weekly load flags 60 hours or two overtime days in the last seven days', () => {
  const now = parseTime('2026-10-07', '12:00');
  const recent = [day('a', '2026-10-05', '05:00', '18:00'), day('a', '2026-10-06', '05:00', '18:00'), day('b', '2026-10-06', '08:00', '16:00'), day('b', '2026-09-20', '01:00', '23:00')];
  assert.deepEqual(weeklyLoad(recent, people, now).map(r => [r.name, r.hours / h, r.overtimeDays, r.flagged]), [['Johnson Muyingo', 26, 2, true], ['Sammy Ochola', 8, 0, false]]);
});

test('rest watch uses the 10-hour rest after a day over 12 hours', () => {
  const recent = [day('b', '2026-10-01', '06:00', '19:30')];
  const rows = restWatch(recent, [], people, parseTime('2026-10-02', '04:00'));
  assert.deepEqual(rows.map(r => [r.kind, r.longRest, r.until === parseTime('2026-10-02', '05:30')]), [['resting', true, true]]);
  assert.deepEqual(restWatch(recent, [], people, parseTime('2026-10-02', '05:30')), []);
});

test('limit exceptions flag days over 20 hours and check-ins inside the 10-hour rest, not midnight continuations', () => {
  const over = day('a', '2026-10-01', '01:00', '22:00');
  const early = day('b', '2026-10-01', '06:00', '19:00'), back = day('b', '2026-10-02', '02:00', '06:00');
  const first: ReportDay = { uid: 'a', date: '2026-10-05', status: 'recorded', sessions: [{ start: parseTime('2026-10-05', '06:00'), end: parseTime('2026-10-06', '00:00'), station: 'Nairobi', stationId: 'n', timeZone: 'Africa/Nairobi' }] };
  const cont: ReportDay = { uid: 'a', date: '2026-10-06', status: 'recorded', sessions: [{ start: parseTime('2026-10-06', '00:00'), end: parseTime('2026-10-06', '02:00'), station: 'Nairobi', stationId: 'n', timeZone: 'Africa/Nairobi' }] };
  const rows = limitExceptions([over, early, back, first, cont], people);
  assert.deepEqual(rows.map(r => [r.name, r.date, r.kind]), [['Sammy Ochola', '2026-10-02', 'short_rest'], ['Johnson Muyingo', '2026-10-01', 'over_cap']]);
  assert.match(rows[0].detail, /Started 7h 0m after the last check-out; 10 hours were required after 13h 0m on 2026-10-01/);
});
