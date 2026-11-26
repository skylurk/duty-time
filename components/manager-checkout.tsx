'use client';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { dateKey, duration, timeLabel, TIME_ZONE, type Active } from '@/lib/duty';
import { Button } from './ui/button';
import { Modal } from './modal';

/** Lets a line manager or administrator end someone else's open session at a stated time, with a reason. */
export function ManagerCheckout({ uid, name, active, notify, done, compact = false }: { uid: string; name: string; active: Pick<Active, 'start' | 'station' | 'timeZone'>; notify: (s: string) => void; done: () => void; compact?: boolean }) {
  const zone = active.timeZone || TIME_ZONE;
  const [open, setOpen] = useState(false), [endDate, setEndDate] = useState(''), [end, setEnd] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  function start() { const now = Date.now(); setEndDate(dateKey(now, zone)); setEnd(timeLabel(now, zone)); setReason(''); setError(''); setOpen(true); }
  async function submit() {
    setBusy(true); setError('');
    try { const r = await api<{ message: string }>('/api/duty', { action: 'managerCheckout', requestId: crypto.randomUUID(), uid, endDate, end, reason }); notify(r.message); setOpen(false); done(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const button = <Button type="button" variant="outline" onClick={start}><LogOut size={15} />Check out now</Button>;
  return <>
    {compact ? button : <section className="card manager-checkout-card"><div><strong><span className="active-dot" aria-hidden />{name} is checked in</strong><small>Since {timeLabel(active.start, zone)} ({zone}) at {active.station} · {duration(Date.now() - active.start)} so far</small></div>{button}</section>}
    {open && <Modal title={`Check out ${name}`} close={() => { if (!busy) setOpen(false); }}>
      <div className="eyebrow">CHECK OUT A TEAM MEMBER</div><h2>Check out {name}</h2>
      <p>Checked in at {timeLabel(active.start, zone)} ({zone}) at {active.station}. Enter when they actually finished. Their hours are saved straight away and the reason is kept in the day’s history.</p>
      <form onSubmit={e => { e.preventDefault(); void submit(); }}>
        <div className="time-inputs"><label>Finish date<input type="date" required min={dateKey(active.start, zone)} max={dateKey(Date.now(), zone)} value={endDate} onChange={e => setEndDate(e.target.value)} /></label><label>Finish time ({zone})<input type="time" required value={end} onChange={e => setEnd(e.target.value)} /></label></div>
        <label>Reason<textarea required minLength={5} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: forgot to check out, confirmed finish time by phone" /></label>
        {error && <p className="form-message" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Checking out…' : `Check out ${name}`}</Button>
      </form>
    </Modal>}
  </>;
}
