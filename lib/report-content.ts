import { duration, timeLabel, zuluLabel, TIME_ZONE, totalForDay, TARGET_MS, type DutyDay } from './duty';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
// Email clients ignore <style> blocks unevenly, so every style is inline and the layout is table-based.
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TONES = {
  alert: { accent: '#B42318', soft: '#FEF3F2', border: '#FECDCA' },
  action: { accent: '#B54708', soft: '#FFFAEB', border: '#FEDF89' },
  success: { accent: '#067647', soft: '#ECFDF3', border: '#ABEFC6' },
  info: { accent: '#1D4ED8', soft: '#EFF6FF', border: '#BFDBFE' },
};
type Tone = keyof typeof TONES;
function badgeFor(kind: string): { label: string; tone: Tone } {
  switch (kind) {
    case 'overtime_alert': return { label: 'Overtime', tone: 'alert' };
    case 'rest_alert': return { label: 'Rest rule', tone: 'alert' };
    case 'automatic_checkout': return { label: 'Action required', tone: 'action' };
    case 'actual_checkout': return { label: 'Confirmed', tone: 'success' };
    case 'closed': return { label: 'Final report', tone: 'info' };
    case 'edited': return { label: 'Correction', tone: 'info' };
    default: return { label: 'Daily summary', tone: 'info' };
  }
}
function stat(label: string, value: string, color = '#101828') {
  return `<td style="padding:6px;" valign="top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #EAECF0;border-radius:10px;"><tr><td style="padding:14px 16px;${FONT};"><div style="font-size:12px;color:#667085;text-transform:uppercase;letter-spacing:.04em;">${label}</div><div style="font-size:22px;font-weight:700;color:${color};margin-top:4px;">${value}</div></td></tr></table></td>`;
}
// Compact UTC range; the end date is only added when it falls on a different UTC day.
function zulu(start: number, end: number) {
  const a = zuluLabel(start), b = zuluLabel(end);
  return `${a.slice(11, 16)}Z – ${b.slice(0, 10) === a.slice(0, 10) ? '' : b.slice(0, 10) + ' '}${b.slice(11, 16)}Z UTC`;
}
function sessionsTable(day: DutyDay) {
  if (!day.sessions.length) return '';
  const th = `class="dt-cell" style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#475467;text-transform:uppercase;letter-spacing:.04em;background:#F2F4F7;border-bottom:1px solid #EAECF0;${FONT};"`;
  const rows = day.sessions.map((s, i) => {
    const td = `class="dt-cell" style="padding:12px;font-size:14px;color:#101828;vertical-align:top;border-bottom:1px solid #EAECF0;background:${i % 2 ? '#FCFCFD' : '#FFFFFF'};${FONT};"`;
    const pill = s.autoCheckoutPending
      ? `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;background:${TONES.action.soft};color:${TONES.action.accent};border:1px solid ${TONES.action.border};">Pending checkout</span>`
      : `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;background:${TONES.success.soft};color:${TONES.success.accent};border:1px solid ${TONES.success.border};">Recorded</span>`;
    return `<tr><td ${td}><strong>${timeLabel(s.start, s.timeZone)} – ${timeLabel(s.end, s.timeZone)}</strong><div style="font-size:12px;color:#667085;margin-top:2px;white-space:nowrap;">${zulu(s.start, s.end)}</div></td><td ${td}>${escape(s.station)}<div style="font-size:12px;color:#667085;margin-top:2px;">${escape(s.timeZone || TIME_ZONE)}</div></td><td ${td} align="right"><strong style="white-space:nowrap;">${duration(s.end - s.start)}</strong><div style="margin-top:6px;">${pill}</div></td></tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EAECF0;border-radius:10px;border-collapse:separate;overflow:hidden;margin-top:8px;"><tr><th ${th}>Time</th><th ${th}>Station</th><th ${th.replace('text-align:left', 'text-align:right')}>Duration</th></tr>${rows}</table>`;
}
function layout(o: { name: string; date: string; kind: string; heading: string; notice?: string; body: string; preheader: string }) {
  const badge = badgeFor(o.kind), tone = TONES[badge.tone];
  const notice = o.notice ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;background:${tone.soft};border:1px solid ${tone.border};border-left:4px solid ${tone.accent};border-radius:8px;"><tr><td style="padding:14px 16px;font-size:14px;line-height:1.55;color:#344054;${FONT};">${escape(o.notice)}</td></tr></table>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(o.heading)}</title><style>@media (max-width:480px){.dt-outer{padding:12px 6px!important}.dt-px{padding-left:16px!important;padding-right:16px!important}.dt-cell{padding:10px 8px!important}}</style></head>
<body style="margin:0;padding:0;background:#F2F4F7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7;"><tr><td class="dt-outer" align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #EAECF0;">
<tr><td style="height:6px;background:${tone.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="dt-px" style="padding:20px 28px;background:#0B1B33;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:18px;font-weight:700;color:#FFFFFF;letter-spacing:.02em;${FONT};">Duty<span style="color:#60A5FA;">Time</span></td><td align="right" style="font-size:13px;color:#98A2B3;${FONT};">${escape(o.date)}</td></tr></table></td></tr>
<tr><td class="dt-px" style="padding:28px 28px 8px;${FONT};">
<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;background:${tone.soft};color:${tone.accent};border:1px solid ${tone.border};">${escape(badge.label)}</span>
<h1 style="margin:14px 0 4px;font-size:24px;line-height:1.3;color:#101828;${FONT};">${escape(o.heading)}</h1>
<div style="font-size:15px;color:#475467;">${escape(o.name)} · ${escape(o.date)}</div>
${notice}
</td></tr>
<tr><td class="dt-px" style="padding:12px 28px 28px;${FONT};">${o.body}</td></tr>
<tr><td class="dt-px" style="padding:18px 28px;background:#F9FAFB;border-top:1px solid #EAECF0;font-size:12px;line-height:1.6;color:#667085;${FONT};">Times are shown in station local time with UTC/Zulu underneath. Daily target: ${duration(TARGET_MS)}.<br>This is an automated message from DutyTime. Please do not reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}
export function reportContent(name: string, day: DutyDay, kind: string, alertMessage?:string) {
  const total=totalForDay(day),overtime=Math.max(0,total-TARGET_MS);
  const stats=(cells:string[])=>`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr>${cells.join('')}</tr></table>`;
  if(alertMessage){
    const heading=kind==='rest_alert'?'Insufficient rest — check-in denied':'12-hour duty alert';
    const subject=`${name} — ${heading} — ${day.date}`;
    const body=(total?stats([stat('Duty today',duration(total)),stat('Over target',duration(overtime),overtime?TONES.alert.accent:'#101828')]):'')+sessionsTable(day);
    return {subject,text:subject+'\n\n'+alertMessage,html:layout({name,date:day.date,kind,heading,notice:alertMessage,body,preheader:alertMessage})};
  }
  const automatic=kind==='automatic_checkout',corrected=kind==='actual_checkout';
  const pending=day.sessions.filter(s=>s.autoCheckoutPending).reduce((n,s)=>n+s.end-s.start,0);
  const label=automatic?'automatic checkout — action required':corrected?'actual checkout confirmed':kind==='closed'?'final daily report':kind==='edited'?'corrected duty report':'duty report';
  const title=`${name} — ${day.date} ${label}`;
  const notice=automatic?'The system automatically checked out this duty at the configured cutoff. Status: Pending actual checkout. The user or their line manager must record the actual checkout date and time in DutyTime. Provisional hours are excluded from confirmed totals.':corrected?'The actual checkout time has been recorded. Daily hours and overtime have been recalculated.':'';
  const lines=day.sessions.map(s=>`${timeLabel(s.start,s.timeZone)} – ${timeLabel(s.end,s.timeZone)} | ${s.station} (${s.timeZone||TIME_ZONE}) | ${zuluLabel(s.start)} – ${zuluLabel(s.end)} | ${duration(s.end-s.start)}${s.autoCheckoutPending?' | Pending actual checkout (provisional)':''}`);
  const totals=`Confirmed total: ${duration(total)}\nConfirmed overtime: ${duration(overtime)}${overtime?' (12-hour daily target exceeded)':''}${pending?`\nProvisional hours awaiting actual checkout: ${duration(pending)}`:''}`;
  const text=`${title}\nTimes shown in station local time and UTC/Zulu.\n${notice}\n\nCheck in – Check out | Station | Duration\n${lines.join('\n')}\n\n${totals}`;
  const cells=[stat('Confirmed total',duration(total)),stat('Overtime',duration(overtime),overtime?TONES.alert.accent:'#101828')];
  if(pending)cells.push(stat('Provisional',duration(pending),TONES.action.accent));
  const heading=label.charAt(0).toUpperCase()+label.slice(1);
  const html=layout({name,date:day.date,kind,heading,notice,body:stats(cells)+sessionsTable(day),preheader:`${name}: ${duration(total)} confirmed${overtime?`, ${duration(overtime)} overtime`:''}`});
  return {subject:title,text,html};
}
