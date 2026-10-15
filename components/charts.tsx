'use client';
import { useState } from 'react';
import { duration } from '@/lib/duty';
// Validated with the dataviz palette checker (CVD separation, contrast on white): regular duty blue, overtime red.
export const CHART = { regular: '#2f7fc4', overtime: '#d6453d' };
const H = 3_600_000;
function niceMax(ms: number) { const hours = Math.max(1, ms / H), step = hours <= 12 ? 2 : hours <= 30 ? 5 : hours <= 60 ? 10 : hours <= 150 ? 25 : hours <= 300 ? 50 : 100; return Math.ceil(hours / step) * step; }

export type Column = { key: string; label: string; regular: number; overtime: number; detail?: string };
/** Stacked columns (regular below, overtime above) on one hours axis, with a per-column tooltip on hover and focus. */
export function StackedColumns({ columns, title }: { columns: Column[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...columns.map(c => c.regular + c.overtime), 0)), ticks = [0, max / 2, max];
  const every = Math.ceil(columns.length / 10);
  const c = hover === null ? null : columns[hover];
  return <figure className="chart" aria-label={title}>
    <div className="chart-legend"><span><i style={{ background: CHART.regular }} />Regular hours (up to 12h a day)</span><span><i style={{ background: CHART.overtime }} />Overtime</span></div>
    <div className="column-chart">
      <div className="chart-axis" aria-hidden>{[...ticks].reverse().map(t => <span key={t}>{t}h</span>)}</div>
      <div className="chart-plot" onMouseLeave={() => setHover(null)}>
        {ticks.map(t => <div key={t} className="chart-grid" style={{ bottom: `${(t / max) * 100}%` }} />)}
        {columns.map((col, i) => {
          const reg = (col.regular / H / max) * 100, ot = (col.overtime / H / max) * 100;
          return <button key={col.key} className={`chart-col ${hover === i ? 'is-hover' : ''}`} aria-label={`${col.label}: ${duration(col.regular + col.overtime)} total, ${duration(col.overtime)} overtime`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <span className="chart-stack">
              {col.overtime > 0 && <span className="chart-seg top" style={{ height: `${ot}%`, background: CHART.overtime }} />}
              {col.regular > 0 && <span className={`chart-seg ${col.overtime > 0 ? '' : 'top'}`} style={{ height: `${reg}%`, background: CHART.regular }} />}
            </span>
          </button>;
        })}
        {c && hover !== null && <div className="chart-tooltip" style={{ left: `${Math.min(85, Math.max(15, ((hover + 0.5) / columns.length) * 100))}%` }} role="status">
          <strong>{c.label}</strong>
          <span><i style={{ background: CHART.regular }} /><b>{duration(c.regular + c.overtime)}</b> total</span>
          <span><i style={{ background: CHART.overtime }} /><b>{duration(c.overtime)}</b> overtime</span>
          {c.detail && <small>{c.detail}</small>}
        </div>}
      </div>
    </div>
    <div className="chart-x" aria-hidden>{columns.map((col, i) => <span key={col.key}>{i % every === 0 ? col.label : ''}</span>)}</div>
  </figure>;
}

export type BarRow = { key: string; label: string; value: number; detail: string };
/** Single-series horizontal bars with the value at the bar tip. */
export function HorizontalBars({ rows, empty }: { rows: BarRow[]; empty: string }) {
  if (!rows.length) return <p className="empty-copy">{empty}</p>;
  const max = Math.max(...rows.map(r => r.value));
  return <div className="hbars">{rows.map(r => <div className="hbar" key={r.key} title={`${r.label}: ${duration(r.value)} · ${r.detail}`}>
    <span className="hbar-label">{r.label}<small>{r.detail}</small></span>
    <span className="hbar-track"><span className="hbar-fill" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: CHART.overtime }} /><b>{duration(r.value)}</b></span>
  </div>)}</div>;
}
