import { z } from 'zod';

/** Who receives one type of email. `extra` is any further addresses: users, station contacts or typed emails. */
export type NotificationRule = { enabled: boolean; person: boolean; managers: boolean; stations: boolean; extra: string[] };
export type NotificationType = 'duty_report' | 'overtime_alert' | 'rest_alert' | 'automatic_checkout' | 'actual_checkout';
export type NotificationRules = Record<NotificationType, NotificationRule>;

/** The email types admins can route, in the order shown in Settings. Defaults match DutyTime's original recipients. */
export const NOTIFICATIONS: { type: NotificationType; kinds: string[]; title: string; when: string; defaults: Omit<NotificationRule, 'extra'> }[] = [
  { type: 'duty_report', kinds: ['checkout', 'closed', 'edited', 'approved'], title: 'Duty report (days over 12 hours)', when: 'When someone checks out, closes their day, or has hours corrected or approved, and that day is over 12 hours.', defaults: { enabled: true, person: false, managers: true, stations: false } },
  { type: 'overtime_alert', kinds: ['overtime_alert'], title: '12-hour duty alert', when: 'While someone is on duty, as soon as their day passes 12 hours.', defaults: { enabled: true, person: false, managers: true, stations: true } },
  { type: 'rest_alert', kinds: ['rest_alert'], title: 'Check-in refused (rest needed)', when: 'When someone tries to check in before their required rest is over.', defaults: { enabled: true, person: false, managers: true, stations: true } },
  { type: 'automatic_checkout', kinds: ['automatic_checkout'], title: 'Automatic checkout', when: 'When the system checks someone out at their cutoff or the 20-hour limit. Their actual finish time still needs to be entered.', defaults: { enabled: true, person: true, managers: true, stations: false } },
  { type: 'actual_checkout', kinds: ['actual_checkout'], title: 'Actual checkout confirmed', when: 'When the actual finish time is entered after an automatic checkout.', defaults: { enabled: true, person: true, managers: true, stations: false } },
];
export const RECIPIENT_GROUPS: { key: 'person' | 'managers' | 'stations'; label: string; hint: string }[] = [
  { key: 'person', label: 'The person', hint: 'The team member the email is about' },
  { key: 'managers', label: 'Their line managers', hint: 'Everyone assigned as their line manager' },
  { key: 'stations', label: 'Station contacts', hint: 'Maintenance and Operations contacts at the station' },
];

const clean = (emails: unknown) => Array.isArray(emails) ? [...new Set(emails.filter((e): e is string => typeof e === 'string').map(e => e.trim().toLowerCase()).filter(e => z.email().safeParse(e).success))].slice(0, 50) : [];

/**
 * The effective rules from stored settings. Types an admin has not saved yet keep their defaults; until then the two
 * alerts also include the older shared alert list (`alertEmails`).
 */
export function notificationRules(settings: { notifications?: unknown; alertEmails?: unknown } | null | undefined): NotificationRules {
  const stored = (settings?.notifications && typeof settings.notifications === 'object' ? settings.notifications : {}) as Record<string, Partial<NotificationRule>>;
  const legacy = clean(settings?.alertEmails);
  return Object.fromEntries(NOTIFICATIONS.map(n => {
    const s = stored[n.type], isAlert = n.type === 'overtime_alert' || n.type === 'rest_alert';
    const bool = (k: keyof Omit<NotificationRule, 'extra'>) => typeof s?.[k] === 'boolean' ? s[k] as boolean : n.defaults[k];
    return [n.type, { enabled: bool('enabled'), person: bool('person'), managers: bool('managers'), stations: bool('stations'), extra: s ? clean(s.extra) : isAlert ? legacy : [] }];
  })) as NotificationRules;
}
/** The rule that applies to a stored report kind (routine reports share the duty report rule). */
export function ruleForKind(rules: NotificationRules, kind: string): NotificationRule {
  const n = NOTIFICATIONS.find(x => x.kinds.includes(kind));
  return n ? rules[n.type] : rules.duty_report;
}

const ruleSchema = z.object({ enabled: z.boolean(), person: z.boolean(), managers: z.boolean(), stations: z.boolean(), extra: z.array(z.email()).max(50) });
export const notificationsSchema = z.object(Object.fromEntries(NOTIFICATIONS.map(n => [n.type, ruleSchema])) as Record<NotificationType, typeof ruleSchema>);
