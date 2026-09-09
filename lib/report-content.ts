import { duration, timeLabel, zuluLabel, TIME_ZONE, totalForDay, TARGET_MS, type DutyDay } from './duty';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function reportContent(name: string, day: DutyDay, kind: string, alertMessage?:string) {
  if(alertMessage){const subject=`${name} — ${kind==='rest_alert'?'Insufficient rest — check-in denied':'12-hour duty alert'} — ${day.date}`;return {subject,text:subject+'\n\n'+alertMessage,html:`<h2>${escape(subject)}</h2><p>${escape(alertMessage)}</p>`};}
  const automatic=kind==='automatic_checkout',corrected=kind==='actual_checkout';
  const total=totalForDay(day),overtime=Math.max(0,total-TARGET_MS);
  const pending=day.sessions.filter(s=>s.autoCheckoutPending).reduce((n,s)=>n+s.end-s.start,0);
  const title=`${name} — ${day.date} ${automatic?'automatic checkout — action required':corrected?'actual checkout confirmed':kind==='closed'?'final daily report':kind==='edited'?'corrected duty report':'duty report'}`;
  const notice=automatic?'The system automatically checked out this duty at the configured cutoff. Status: Pending actual checkout. The user or their line manager must record the actual checkout date and time in DutyTime. Provisional hours are excluded from confirmed totals.':corrected?'The actual checkout time has been recorded. Daily hours and overtime have been recalculated.':'';
  const lines=day.sessions.map(s=>`${timeLabel(s.start,s.timeZone)} – ${timeLabel(s.end,s.timeZone)} | ${s.station} (${s.timeZone||TIME_ZONE}) | ${zuluLabel(s.start)} – ${zuluLabel(s.end)} | ${duration(s.end-s.start)}${s.autoCheckoutPending?' | Pending actual checkout (provisional)':''}`);
  const totals=`Confirmed total: ${duration(total)}\nConfirmed overtime: ${duration(overtime)}${overtime?' (12-hour daily target exceeded)':''}${pending?`\nProvisional hours awaiting actual checkout: ${duration(pending)}`:''}`;
  const text=`${title}\nTimes shown in station local time and UTC/Zulu.\n${notice}\n\nCheck in – Check out | Station | Duration\n${lines.join('\n')}\n\n${totals}`;
  const html=`<h2>${escape(title)}</h2><p>Times shown in station local time and UTC/Zulu.</p>${notice?`<p>${escape(notice)}</p>`:''}<table cellpadding="8" cellspacing="0" border="1"><tr><th>Check in</th><th>Check out</th><th>Station</th><th>Duration</th><th>Status</th></tr>${day.sessions.map(s=>`<tr><td>${timeLabel(s.start,s.timeZone)}</td><td>${timeLabel(s.end,s.timeZone)}</td><td>${escape(s.station)} (${escape(s.timeZone||TIME_ZONE)})<br>${zuluLabel(s.start)} – ${zuluLabel(s.end)}</td><td>${duration(s.end-s.start)}</td><td>${s.autoCheckoutPending?'Pending actual checkout':'Recorded'}</td></tr>`).join('')}</table><p>${escape(totals).replaceAll('\n','<br>')}</p>`;
  return {subject:title,text,html};
}
