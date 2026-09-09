'use client';
import { useEffect,useState } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { userManual,type ManualContent } from '@/lib/user-manual';
export function Manual({kind}:{kind:'user'|'admin'}){
 const [admin,setAdmin]=useState<ManualContent|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(kind!=='admin')return;const controller=new AbortController();setAdmin(null);setError('');api<ManualContent>('/api/manual',undefined,controller.signal).then(setAdmin).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[kind,retry]);
 const content=kind==='user'?userManual:admin;
 if(!content)return <section className="card manual-page" role="status">{error||'Loading admin manual…'}{error&&<button className="text-button" onClick={()=>setRetry(n=>n+1)}>Retry</button>}</section>;
 return <article className="card manual-page"><header className="manual-heading"><span className="title-icon"><BookOpen size={24}/></span><div><div className="eyebrow">DUTYTIME HELP</div><h2>{content.title}</h2><p>{content.intro}</p></div></header><nav className="manual-contents" aria-label={`${content.title} contents`}>{content.sections.map(s=><a key={s.id} href={`#manual-${kind}-${s.id}`}>{s.title}<ChevronRight size={15}/></a>)}</nav><div className="manual-sections">{content.sections.map(s=><section id={`manual-${kind}-${s.id}`} key={s.id}><h3>{s.title}</h3><ol>{s.steps.map((step,i)=><li key={i}>{step}</li>)}</ol>{s.note&&<p className="manual-note">{s.note}</p>}</section>)}</div></article>;
}
