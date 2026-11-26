import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { notificationRules, ruleForKind, NOTIFICATIONS } from '../lib/notifications';

test('defaults keep the original recipients for every email', () => {
  const r = notificationRules(undefined);
  assert.deepEqual(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [v.enabled, v.person, v.managers, v.stations, v.extra.length]])), {
    duty_report: [true, false, true, false, 0], overtime_alert: [true, false, true, true, 0], rest_alert: [true, false, true, true, 0],
    automatic_checkout: [true, true, true, false, 0], actual_checkout: [true, true, true, false, 0],
  });
});

test('the older shared alert list applies to both alerts until an admin saves rules', () => {
  const r = notificationRules({ alertEmails: ['Quality@Example.com', 'not-an-email'] });
  assert.deepEqual([r.overtime_alert.extra, r.rest_alert.extra, r.automatic_checkout.extra], [['quality@example.com'], ['quality@example.com'], []]);
  const saved = notificationRules({ alertEmails: ['quality@example.com'], notifications: { overtime_alert: { enabled: true, person: false, managers: false, stations: false, extra: [] } } });
  assert.deepEqual([saved.overtime_alert.extra, saved.overtime_alert.managers, saved.rest_alert.extra], [[], false, ['quality@example.com']]);
});

test('rules shared with the scheduled job import nothing it does not package', () => {
  for (const f of ['lib/notifications.ts', 'lib/report-worker.ts']) assert.doesNotMatch(readFileSync(f, 'utf8'), /from 'zod'/);
});

test('each stored report kind maps to its email type', () => {
  const r = notificationRules({ notifications: { duty_report: { enabled: false, person: false, managers: true, stations: false, extra: [] } } });
  for (const kind of ['checkout', 'closed', 'edited', 'approved']) assert.equal(ruleForKind(r, kind).enabled, false);
  assert.equal(ruleForKind(r, 'automatic_checkout').person, true);
  assert.equal(NOTIFICATIONS.length, 5);
});
