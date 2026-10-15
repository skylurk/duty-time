'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/modal';
import { dateKey, dayStart, duration, nextDate, timeLabel, TIME_ZONE, TARGET_MS } from '@/lib/duty';
import { calendarSummary, dayBreakdown, type ReportData } from '@/lib/reports';
import { monthRange, useReportData } from './report-data';

/** Hours each person on duty now has worked on `date` in their station's local day (0 if not on that date). */
function liveOn(data: ReportData, date: string, now: number) {
  return data.active.map(a => {
    const end = Math.min(now, a.cutoffAt ?? now), from = Math.max(a.start, dayStart(date, a.timeZone)), to = Math.min(end, dayStart(nextDate(date), a.timeZone));
    return { ...a, name: data.people.find(p => p.uid === a.uid)?.name || 'Former member', position: data.people.find(p => p.uid === a.uid)?.position || '', elapsed: Math.max(0, to - from) };
  }).filter(a => a.elapsed > 0);
}

export function TeamCalendar() {
  const [month, setMonth] = useState(dateKey().slice(0, 7)), [selected, setSelected] = useState<string | null>(null);
  const { from, to } = monthRange(month), { data, error, loading, retry } = useReportData(from, to);
  const summary = useMemo(() => calendarSummary(data?.from === from ? data.days : []), [data, from]);
  const [year, mm] = month.split('-').map(Number), first = new Date(year, mm - 1, 1, 12), count = new Date(year, mm, 0).getDate(), offset = (first.getDay() + 6) % 7, today = dateKey();
  const move = (delta: number) => { const d = new Date(year, mm - 1 + delta, 1, 12); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const now = Date.now();
  return <section className="card calendar-card team-calendar">
    <div className="calendar-header"><div><h2>Team calendar</h2><p>Everyone’s recorded hours. Select a day to see each person’s hours; anyone over 12 hours is marked in red.</p></div>{loading && <span className="status-chip" role="status">Updating…</span>}</div>
    <div className="calendar-toolbar"><div className="month-switch"><h3>{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h3><button aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft size={16} /></button><button aria-label="Next month" onClick={() => move(1)}><ChevronRight size={16} /></button><button className="today-button" onClick={() => setMonth(today.slice(0, 7))}>Today</button></div><div className="legend"><span><i className="normal" />People on duty</span><span><i className="over" />Over 12 hours</span></div></div>
    {error && !data ? <div className="empty-state"><p>{error}</p><Button onClick={retry}>Try again</Button></div> :
      <div className="calendar-grid">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div className="weekday" key={d}>{d}</div>)}{Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
        const d = new Date(year, mm - 1, i - offset + 1, 12), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, own = d.getMonth() === mm - 1;
        const s = own ? summary.get(date) : undefined, live = own && data && date === today ? liveOn(data, date, now).length : 0;
        const label = `${date}${s ? `, ${s.people} ${s.people === 1 ? 'person' : 'people'}, ${duration(s.total)}${s.overtimePeople ? `, ${s.overtimePeople} over 12 hours` : ''}` : ', no recorded hours'}${live ? `, ${live} on duty now` : ''}`;
        return <button key={date} aria-label={label} className={`day ${!own ? 'outside' : ''} ${date === today ? 'is-today' : ''} ${[0, 6].includes(d.getDay()) ? 'weekend' : ''} ${s?.overtimePeople ? 'over-limit-day' : ''}`} onClick={() => { if (!own) setMonth(date.slice(0, 7)); else setSelected(date); }}>
          <span className="day-number">{d.getDate()}</span>{date === today && <span className="today-text">Today</span>}
          {s && <div className={`calendar-entry team-entry ${s.overtimePeople ? 'overtime-entry' : ''}`}><span className="team-entry-count"><Users size={11} aria-hidden />{s.people}</span><span className="entry-detail">{duration(s.total)}</span></div>}
          {s?.overtimePeople ? <span className="ot-badge">{s.overtimePeople}<span className="ot-text"> over 12h</span></span> : null}
          {live > 0 && <span className="live-badge"><span className="active-dot" aria-hidden />{live} on duty</span>}
        </button>;
      })}</div>}
    <div className="calendar-footer"><span>Confirmed hours only. Provisional time awaiting an actual checkout is listed separately.</span><span>Dates are station-local duty days</span></div>
    {selected && data && <DayModal data={data} date={selected} close={() => setSelected(null)} />}
  </section>;
}

function DayModal({ data, date, close }: { data: ReportData; date: string; close: () => void }) {
  const entries = dayBreakdown(data.days, data.people, date), live = liveOn(data, date, Date.now());
  const total = entries.reduce((n, e) => n + e.total, 0), over = entries.filter(e => e.overtime > 0).length;
  const heading = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return <Modal title={`Team hours on ${date}`} close={close}>
    <div className="eyebrow">TEAM CALENDAR</div><h2>{heading}</h2>
    <p>{entries.length ? `${entries.length} ${entries.length === 1 ? 'person' : 'people'} · ${duration(total)} recorded` : 'No recorded hours for this day.'}{over ? <> · <strong className="text-over">{over} over 12 hours</strong></> : null}</p>
    {live.length > 0 && <div className="day-live"><h3><span className="active-dot" aria-hidden />On duty now</h3>{live.map(a => <div className="day-person" key={a.uid}><div><strong>{a.name}</strong><small>{a.position}{a.position ? ' · ' : ''}checked in {timeLabel(a.start, a.timeZone)} ({a.timeZone || TIME_ZONE}) · {a.station}</small></div><span className={`day-person-hours ${a.elapsed > TARGET_MS ? 'hours-over' : ''}`}>{duration(a.elapsed)}<small>so far</small></span></div>)}</div>}
    <div className="day-people">{entries.map(e => <div className={`day-person ${e.overtime ? 'is-over' : ''}`} key={e.uid}>
      <div><strong>{e.name}</strong><small>{e.position}</small>
        {e.sessions.map((s, i) => <small key={i} className="day-person-session"><MapPin size={11} aria-hidden />{timeLabel(s.start, s.timeZone)} – {timeLabel(s.end, s.timeZone)} · {s.station} ({s.timeZone || TIME_ZONE}){s.autoCheckoutPending ? ' · provisional, awaiting actual checkout' : ''}</small>)}
      </div>
      <span className={`day-person-hours ${e.overtime ? 'hours-over' : ''}`}>{duration(e.total)}{e.overtime ? <small>+{duration(e.overtime)} overtime</small> : e.pending ? <small>{duration(e.pending)} provisional</small> : null}</span>
    </div>)}</div>
  </Modal>;
}
