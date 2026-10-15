'use client';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { csvCell, dateKey, DAY_MS, duration, timeLabel, zuluLabel, TIME_ZONE } from '@/lib/duty';
import { limitExceptions, overtimeByStation, overtimeReport, restWatch, trendBuckets, trendTotals, weeklyLoad, HIGH_LOAD_HOURS, HIGH_LOAD_OVERTIME_DAYS, type ReportData } from '@/lib/reports';
import { HorizontalBars, StackedColumns } from './charts';
import { monthRange, useReportData } from './report-data';

const SECTIONS = ['Overtime', 'Trends', 'Rest & load', 'Email delivery'] as const;
type Section = typeof SECTIONS[number];
function presets(today: string) {
  const month = today.slice(0, 7), [y, m] = month.split('-').map(Number), prev = new Date(y, m - 2, 1, 12);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  return [
    { label: 'This month', ...monthRange(month), },
    { label: 'Last month', ...monthRange(prevMonth) },
    { label: 'Last 30 days', from: dateKey(Date.parse(`${today}T12:00:00Z`) - 29 * DAY_MS, 'UTC'), to: today },
    { label: 'Last 90 days', from: dateKey(Date.parse(`${today}T12:00:00Z`) - 89 * DAY_MS, 'UTC'), to: today },
    { label: 'This year', from: `${y}-01-01`, to: today },
  ];
}
const fmtDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function ReportsPanel({ delivery }: { delivery: ReactNode }) {
  const today = dateKey(), options = presets(today);
  const [section, setSection] = useState<Section>('Overtime'), [range, setRange] = useState({ from: options[0].from, to: options[0].to });
  const { data, error, loading, retry } = useReportData(range.from, range.to);
  const usesRange = section === 'Overtime' || section === 'Trends';
  return <section className="reports-panel">
    <div className="report-sections no-print" role="tablist" aria-label="Reports">{SECTIONS.map(s => <button key={s} role="tab" aria-selected={s === section} className={s === section ? 'active' : ''} onClick={() => setSection(s)}>{s}</button>)}</div>
    {usesRange && <div className="report-range no-print">
      <div className="report-presets">{options.map(o => <button key={o.label} className={o.from === range.from && o.to === range.to ? 'active' : ''} onClick={() => setRange({ from: o.from, to: o.to })}>{o.label}</button>)}</div>
      <div className="report-dates"><label>From<input type="date" value={range.from} max={range.to} onChange={e => e.target.value && setRange(r => ({ ...r, from: e.target.value }))} /></label><label>To<input type="date" value={range.to} min={range.from} onChange={e => e.target.value && setRange(r => ({ ...r, to: e.target.value }))} /></label>{loading && <span className="status-chip" role="status">Updating…</span>}</div>
    </div>}
    {section === 'Email delivery' ? delivery : error && !data ? <section className="card empty-state"><h2>Reports unavailable</h2><p>{error}</p><Button onClick={retry}>Try again</Button></section> : !data ? <section className="card empty-state" role="status">Loading reports…</section> :
      section === 'Overtime' ? <OvertimeReport data={data} /> : section === 'Trends' ? <Trends data={data} /> : <RestAndLoad data={data} />}
  </section>;
}

function Tiles({ items }: { items: [string, string, boolean?][] }) {
  return <div className="report-tiles">{items.map(([label, value, alert]) => <div className="report-tile" key={label}><span>{label}</span><strong className={alert ? 'text-over' : ''}>{value}</strong></div>)}</div>;
}

function OvertimeReport({ data }: { data: ReportData }) {
  const rows = useMemo(() => overtimeReport(data.days, data.people), [data]), exceptions = useMemo(() => limitExceptions(data.days, data.people), [data]);
  const days = rows.reduce((n, r) => n + r.days.length, 0), total = rows.reduce((n, r) => n + r.overtime, 0);
  function exportCsv() {
    const out: unknown[][] = [['Name', 'Position', 'Date', 'Stations', 'First check-in (local)', 'Last check-out (local)', 'Time zone', 'Total hours', 'Overtime hours']];
    for (const r of rows) for (const d of r.days) out.push([r.name, r.position, d.date, d.stations.join('; '), timeLabel(d.firstStart, d.timeZone), timeLabel(d.lastEnd, d.timeZone), d.timeZone || TIME_ZONE, (d.total / 3_600_000).toFixed(2), (d.overtime / 3_600_000).toFixed(2)]);
    const url = URL.createObjectURL(new Blob(['﻿' + out.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `duty-time-overtime-${data.from}-to-${data.to}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="card report-card print-area">
    <div className="print-only print-heading"><strong>{data.companyName} — Overtime report</strong><span>{fmtDate(data.from)} to {fmtDate(data.to)} · Generated {zuluLabel(data.generatedAt)}</span></div>
    <div className="calendar-header"><div><h2>Overtime</h2><p>Everyone whose confirmed hours went over 12 in a day, with the dates and how much over.</p></div><div className="user-export-actions no-print"><Button variant="outline" disabled={!rows.length} onClick={exportCsv}><Download size={15} />Export CSV</Button><Button disabled={!rows.length} onClick={() => window.print()}><Printer size={15} />Print</Button></div></div>
    <Tiles items={[['People with overtime', String(rows.length)], ['Overtime days', String(days)], ['Total overtime', duration(total), total > 0]]} />
    {rows.length ? <div className="table-wrap"><table className="report-table">
      <thead><tr><th>Date</th><th>Station</th><th>On duty (local)</th><th className="num">Hours</th><th className="num">Overtime</th></tr></thead>
      <tbody>{rows.map(r => <Fragment key={r.uid}>
        <tr className="group-row"><th colSpan={3}>{r.name}<small>{r.position} · {r.days.length} {r.days.length === 1 ? 'day' : 'days'}</small></th><th className="num" /><th className="num text-over">{duration(r.overtime)}</th></tr>
        {r.days.map(d => <tr key={d.date}><td>{fmtDate(d.date)}</td><td>{d.stations.join(', ')}</td><td>{timeLabel(d.firstStart, d.timeZone)} – {timeLabel(d.lastEnd, d.timeZone)} <small>{d.timeZone || TIME_ZONE}</small></td><td className="num">{duration(d.total)}</td><td className="num text-over">+{duration(d.overtime)}</td></tr>)}
      </Fragment>)}</tbody>
      <tfoot><tr><th colSpan={3}>Total · {rows.length} {rows.length === 1 ? 'person' : 'people'}, {days} {days === 1 ? 'day' : 'days'}</th><th className="num" /><th className="num text-over">{duration(total)}</th></tr></tfoot>
    </table></div> : <p className="empty-copy">No overtime between {fmtDate(data.from)} and {fmtDate(data.to)}.</p>}
    <p className="report-note">Overtime is confirmed time above 12 hours in one station-local duty day. Pending requests and provisional hours awaiting an actual checkout are not included.</p>
    <div className="calendar-header exceptions-header"><div><h2>Limit exceptions</h2><p>Hours recorded past the duty limits, through manager corrections, approved missed entries or actual checkouts. Each was saved with a written reason.</p></div><span className={`report-chip ${exceptions.length ? 'chip-over' : 'chip-rest'}`}>{exceptions.length} {exceptions.length === 1 ? 'exception' : 'exceptions'}</span></div>
    {exceptions.length ? <div className="table-wrap"><table className="report-table">
      <thead><tr><th>Date</th><th>Person</th><th>Limit</th><th>Details</th></tr></thead>
      <tbody>{exceptions.map(x => <tr key={`${x.uid}-${x.kind}-${x.at}`}><td>{fmtDate(x.date)}</td><td><strong>{x.name}</strong></td><td><span className="report-chip chip-over">{x.kind === 'over_cap' ? 'Over 20 hours' : 'Rest under 10 hours'}</span></td><td>{x.detail}</td></tr>)}</tbody>
    </table></div> : <p className="empty-copy exceptions-empty">No hours were recorded past the 20-hour daily limit or inside a required 10-hour rest in this range.</p>}
  </section>;
}

function Trends({ data }: { data: ReportData }) {
  const totals = useMemo(() => trendTotals(data.days), [data]), trend = useMemo(() => trendBuckets(data.days, data.from, data.to), [data]);
  const byPerson = useMemo(() => overtimeReport(data.days, data.people).slice(0, 10), [data]), byStation = useMemo(() => overtimeByStation(data.days), [data]);
  return <>
    <section className="card report-card">
      <div className="calendar-header"><div><h2>Trends</h2><p>{fmtDate(data.from)} to {fmtDate(data.to)} · {trend.unit === 'week' ? 'weekly' : 'daily'} totals</p></div></div>
      <Tiles items={[['Total hours', duration(totals.hours)], ['Overtime', duration(totals.overtime), totals.overtime > 0], ['Overtime days', String(totals.overtimeDays)], ['People with overtime', `${totals.overtimePeople} of ${totals.people}`], ['Average day', duration(totals.averageDay)]]} />
      <StackedColumns title={`Hours per ${trend.unit}`} columns={trend.buckets.map(b => ({ key: b.key, label: b.label, regular: b.regular, overtime: b.overtime, detail: `${b.people} ${b.people === 1 ? 'person' : 'people'} on duty${b.overtimePeople ? ` · ${b.overtimePeople} over 12h` : ''}` }))} />
    </section>
    <div className="report-split">
      <section className="card report-card"><div className="calendar-header"><div><h2>Overtime by person</h2><p>Top 10 in this range</p></div></div><HorizontalBars empty="No overtime in this range." rows={byPerson.map(r => ({ key: r.uid, label: r.name, value: r.overtime, detail: `${r.days.length} ${r.days.length === 1 ? 'day' : 'days'}` }))} /></section>
      <section className="card report-card"><div className="calendar-header"><div><h2>Overtime by station</h2><p>Counted at the station where most of the day was worked</p></div></div><HorizontalBars empty="No overtime in this range." rows={byStation.map(r => ({ key: r.station, label: r.station, value: r.overtime, detail: `${r.days} ${r.days === 1 ? 'day' : 'days'}` }))} /></section>
    </div>
  </>;
}

const KIND = { over: ['Over 12 hours', 'chip-over'], approaching: ['Approaching 12 hours', 'chip-warn'], awaiting: ['Rest can’t be verified', 'chip-warn'], resting: ['Resting', 'chip-rest'] } as const;
const kindLabel = (r: { kind: keyof typeof KIND; longRest?: boolean }) => r.kind === 'resting' && r.longRest ? '10-hour rest' : KIND[r.kind][0];
function RestAndLoad({ data }: { data: ReportData }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const rest = restWatch(data.recent, data.active, data.people, now), load = weeklyLoad(data.recent, data.people, now);
  return <>
    <section className="card report-card">
      <div className="calendar-header"><div><h2>Needs rest now</h2><p>Live: people on long duty today, and people still inside their required rest.</p></div><span className="status-chip">{rest.length} {rest.length === 1 ? 'person' : 'people'}</span></div>
      {rest.length ? <div className="table-wrap"><table className="report-table">
        <thead><tr><th>Person</th><th>Status</th><th>Details</th></tr></thead>
        <tbody>{rest.map(r => <tr key={r.uid + r.kind}><td><strong>{r.name}</strong><small>{r.position}</small></td><td><span className={`report-chip ${KIND[r.kind][1]}`}>{kindLabel(r)}</span></td><td>{
          r.kind === 'over' || r.kind === 'approaching' ? <>On duty since {timeLabel(r.since, r.timeZone)} ({r.timeZone || TIME_ZONE}) at {r.station} · <strong className={r.kind === 'over' ? 'text-over' : ''}>{duration(r.today || 0)} today</strong></>
            : r.kind === 'resting' ? <>{r.longRest ? 'Worked over 12 hours. ' : ''}Checked out {timeLabel(r.since, r.timeZone)} at {r.station}. {r.longRest ? 'Can check in again' : 'Can start a new duty day'} at <strong>{timeLabel(r.until!, r.timeZone)}</strong> ({r.timeZone || TIME_ZONE}) · in {duration(r.until! - now)}</>
              : <>Automatic checkout at {timeLabel(r.since, r.timeZone)} ({r.timeZone || TIME_ZONE}) at {r.station}. The actual finish time must be recorded before their next duty day.</>
        }</td></tr>)}</tbody>
      </table></div> : <p className="empty-copy">Nobody is on long duty or inside their rest period right now.</p>}
      <p className="report-note">“Approaching” starts at 10 hours on duty today. After a day over 12 hours, 10 hours’ rest is required before any check-in, even the same day. After a normal day, 8 hours’ rest is required before a new duty day, and short breaks within the day are allowed. Nobody can record more than 20 hours in one day.</p>
    </section>
    <section className="card report-card">
      <div className="calendar-header"><div><h2>Workload, last 7 days</h2><p>Flagged at {HIGH_LOAD_HOURS} hours or {HIGH_LOAD_OVERTIME_DAYS}+ overtime days in the last 7 days.</p></div></div>
      {load.length ? <div className="table-wrap"><table className="report-table">
        <thead><tr><th>Person</th><th className="num">Hours</th><th className="num">Overtime days</th><th /></tr></thead>
        <tbody>{load.map(r => <tr key={r.uid} className={r.flagged ? 'is-flagged' : ''}><td><strong>{r.name}</strong><small>{r.position}</small></td><td className="num">{duration(r.hours)}</td><td className={`num ${r.overtimeDays ? 'text-over' : ''}`}>{r.overtimeDays}</td><td>{r.flagged && <span className="report-chip chip-over">High load</span>}</td></tr>)}</tbody>
      </table></div> : <p className="empty-copy">No recorded hours in the last 7 days.</p>}
    </section>
  </>;
}
