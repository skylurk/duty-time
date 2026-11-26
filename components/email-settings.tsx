'use client';
import { useState } from 'react';
import { Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { RecipientPicker, type AlertContact } from './alert-settings';
import { NOTIFICATIONS, RECIPIENT_GROUPS, type NotificationRules } from '@/lib/notifications';

/** Administration → Settings: choose, for each email DutyTime sends, whether it is sent and who receives it. */
export function EmailSettings({ rules, contacts, notify, onSaved }: { rules: NotificationRules; contacts: AlertContact[]; notify: (s: string) => void; onSaved: (rules: NotificationRules) => void }) {
  const [draft, setDraft] = useState(rules), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const changed = JSON.stringify(draft) !== JSON.stringify(rules);
  function update(type: keyof NotificationRules, patch: Partial<NotificationRules[keyof NotificationRules]>) { setError(''); setDraft(d => ({ ...d, [type]: { ...d[type], ...patch } })); }
  async function save() {
    setBusy(true); setError('');
    try { const r = await api<{ message: string }>('/api/admin', { action: 'notifications', notifications: draft }); onSaved(draft); notify(r.message); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="email-settings" onSubmit={e => { e.preventDefault(); void save(); }}>
    <div className="email-settings-head"><span className="title-icon"><Mail size={20} /></span><div><h3>Email notifications</h3><p>For each email, choose whether it is sent and who gets it. Changes apply to emails sent after you save.</p></div></div>
    {NOTIFICATIONS.map(n => {
      const r = draft[n.type], nobody = r.enabled && !r.person && !r.managers && !r.stations && !r.extra.length;
      return <fieldset className={`email-rule ${r.enabled ? '' : 'is-off'}`} key={n.type} aria-label={n.title}>
        <div className="email-rule-top">
          <div><strong>{n.title}</strong><small>{n.when}</small></div>
          <label className="email-switch"><input type="checkbox" role="switch" checked={r.enabled} disabled={busy} onChange={e => update(n.type, { enabled: e.target.checked })} /><span>{r.enabled ? 'On' : 'Off'}</span></label>
        </div>
        {r.enabled && <>
          <div className="email-groups" role="group" aria-label={`${n.title}: send to`}>
            <span className="email-groups-label">Send to</span>
            {RECIPIENT_GROUPS.map(g => <label key={g.key} className="email-group" title={g.hint}><input type="checkbox" disabled={busy} checked={r[g.key]} onChange={e => update(n.type, { [g.key]: e.target.checked })} />{g.label}</label>)}
          </div>
          <RecipientPicker label={`Also send “${n.title}” to`} selected={r.extra} onChange={extra => update(n.type, { extra })} contacts={contacts} disabled={busy} />
          {nobody && <p className="email-warning" role="status">Nobody is selected, so this email will not reach anyone. Tick a group, add a person, or switch it off.</p>}
        </>}
      </fieldset>;
    })}
    {error && <p role="alert" className="form-message">{error}</p>}
    <div className="email-actions"><Button type="submit" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save email settings'}</Button>{changed && !busy && <Button type="button" variant="outline" onClick={() => setDraft(rules)}>Undo changes</Button>}</div>
  </form>;
}
