import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, type DutyDay } from '../lib/duty';
import { restDecision, longDayRest, hoursOnDate, dailyCapAt, DAILY_CAP_MS } from '../lib/rest';
import { sessionCutoff } from '../lib/cutoff';
const h = 3_600_000;
function day(date: string, ...spans: [string, string, string?][]): DutyDay {
  return { id: `u_${date}`, uid: 'u', company: 'c', date, status: 'recorded', reason: '', closed: false, audit: [], revision: 1,
    sessions: spans.map(([a, b, endDate], i) => ({ id: `${date}-${i}`, start: parseTime(date, a), end: parseTime(endDate || date, b), stationId: 'nbo', station: 'Nairobi', notes: '' })) };
}

test('a day over 12 hours needs 10 hours of rest from the last check-out, even the same day', () => {
  const d = day('2026-10-01', ['06:00', '19:00']); // 13h
  const same = restDecision([d], parseTime('2026-10-01', '20:00'));
  assert.equal(same?.kind, 'long_day');
  assert.match(same!.message, /13h 0m on 2026-10-01.*Rest remaining: 9h 0m.*check in at 05:00 \(Africa\/Nairobi\)/);
  assert.equal(restDecision([d], parseTime('2026-10-02', '04:59'))?.kind, 'long_day');
  assert.equal(restDecision([d], parseTime('2026-10-02', '05:00')), null);
});

test('exactly 12 hours keeps the ordinary 8-hour rest and same-day breaks', () => {
  const d = day('2026-10-01', ['06:00', '18:00']);
  assert.equal(restDecision([d], parseTime('2026-10-01', '18:30')), null);
  assert.equal(restDecision([d], parseTime('2026-10-02', '01:59'))?.kind, 'new_day');
  assert.equal(restDecision([d], parseTime('2026-10-02', '02:00')), null);
});

test('several sessions adding up to more than 12 hours trigger the 10-hour rest', () => {
  const d = day('2026-10-01', ['05:00', '11:00'], ['12:00', '18:30']); // 12h 30m
  assert.equal(restDecision([d], parseTime('2026-10-02', '04:29'))?.kind, 'long_day');
  assert.equal(restDecision([d], parseTime('2026-10-02', '04:30')), null);
});

test('rest runs from the end of a shift that continues past midnight', () => {
  const first = day('2026-10-01', ['06:00', '00:00', '2026-10-02']); // 18h to midnight
  const second = day('2026-10-02', ['00:00', '02:00']);
  assert.equal(longDayRest([first, second], parseTime('2026-10-02', '03:00'))!.until, parseTime('2026-10-02', '12:00'));
  assert.equal(restDecision([first, second], parseTime('2026-10-02', '11:59'))?.kind, 'long_day');
  assert.equal(restDecision([first, second], parseTime('2026-10-02', '12:00')), null);
});

test('once 10 hours of rest are taken, later short shifts are not held back', () => {
  const over = day('2026-10-01', ['06:00', '19:00']), next = day('2026-10-02', ['05:00', '07:00']);
  assert.equal(restDecision([over, next], parseTime('2026-10-02', '08:00')), null);
});

test('provisional hours awaiting an actual checkout do not count towards 12 hours', () => {
  const d = day('2026-10-01', ['06:00', '11:00'], ['11:30', '19:00']);
  d.sessions[1].autoCheckoutPending = true; d.status = 'pending_checkout';
  assert.equal(longDayRest([d], parseTime('2026-10-02', '03:00')), null);
});

test('the 20-hour cap uses the hours already on that date and resets after midnight', () => {
  const d = day('2026-10-01', ['00:30', '15:30']); // 15h
  const start = parseTime('2026-10-01', '16:00');
  assert.equal(hoursOnDate([d], start), 15 * h);
  assert.equal(dailyCapAt(start, 15 * h), start + 5 * h);
  assert.equal(dailyCapAt(parseTime('2026-10-01', '22:00'), 0), parseTime('2026-10-02', '20:00'));
  assert.equal(hoursOnDate([d], parseTime('2026-10-01', '10:00')), 9.5 * h);
  assert.equal(DAILY_CAP_MS, 20 * h);
});

test('an open session stops at the earlier of the cutoff and the 20-hour cap', () => {
  const start = parseTime('2026-10-01', '01:00');
  assert.equal(sessionCutoff({ start, capAt: start + 20 * h }, '23:30').cutoffAt, start + 20 * h);
  assert.equal(sessionCutoff({ start, capAt: start + 20 * h }).cutoffAt, parseTime('2026-10-01', '19:00'));
  assert.equal(sessionCutoff({ start }).cutoffAt, parseTime('2026-10-01', '19:00'));
});
