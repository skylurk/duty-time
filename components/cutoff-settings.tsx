'use client';
import { useState } from 'react';
import { Clock3 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
export function CutoffSettings({uid,value,notify,refresh}:{uid:string;value?:string|null;notify:(s:string)=>void;refresh:()=>void}){
 const [clock,setClock]=useState(value||'19:00'),[useDefault,setUseDefault]=useState(!value),[busy,setBusy]=useState(false);
 async function save(){setBusy(true);try{const result=await api<{message:string}>('/api/cutoff',{action:'set',uid,cutoffTime:useDefault?null:clock});notify(result.message);refresh();}catch(e){notify((e as Error).message);}finally{setBusy(false);}}
 return <section className="cutoff-settings"><div className="cutoff-heading"><Clock3 size={18}/><div><h3>Automatic checkout &amp; lockout</h3><p>Set this user’s daily lockout time to override 7:00 pm at the selected station. At that time, open duty is automatically checked out and new check-ins are blocked. Changes also apply to an open session.</p></div></div><label className="check-label"><input type="checkbox" checked={useDefault} onChange={e=>setUseDefault(e.target.checked)}/>Use the system default (7:00 pm)</label>{!useDefault&&<label>Daily cutoff time (station local)<input type="time" required value={clock} onChange={e=>setClock(e.target.value)}/></label>}<Button type="button" variant="outline" disabled={busy||!useDefault&&!clock} onClick={save}>{busy?'Saving…':'Save cutoff'}</Button></section>;
}
