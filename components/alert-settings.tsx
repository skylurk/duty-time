'use client';
import { useId, useMemo, useState } from 'react';
import { z } from 'zod';
import { X, Search, Plus } from 'lucide-react';
import { Button } from './ui/button';
export type AlertContact={name:string;email:string;kind:'user'|'station'};
const normalize=(email:string)=>email.trim().toLowerCase();
/** Searchable multi-select of users and station contacts, plus typed email addresses (up to 50). */
export function RecipientPicker({selected,onChange,contacts=[],label,disabled=false}:{selected:string[];onChange:(emails:string[])=>void;contacts?:AlertContact[];label:string;disabled?:boolean}){
 const id=useId(),[query,setQuery]=useState(''),[error,setError]=useState(''),[open,setOpen]=useState(false);
 const options=useMemo(()=>{const map=new Map<string,AlertContact>();for(const c of contacts){const email=normalize(c.email);if(z.email().safeParse(email).success){const old=map.get(email);map.set(email,{...c,email,name:old?`${old.name} / ${c.name}`:c.name});}}return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));},[contacts]);
 const matches=options.filter(c=>`${c.name} ${c.email}`.toLowerCase().includes(query.trim().toLowerCase()));
 const typed=normalize(query),validEmail=z.email().safeParse(typed).success;
 function toggle(email:string){setError('');onChange(selected.includes(email)?selected.filter(e=>e!==email):selected.length<50?[...selected,email]:selected);}
 function add(){if(!validEmail){setError('Enter a valid email address to add it.');return;}if(!selected.includes(typed)){if(selected.length>=50){setError('You can select up to 50 recipients.');return;}onChange([...selected,typed]);}setQuery('');setError('');}
 return <div className="recipient-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOpen(false);}}>
  <div className="recipient-chips" aria-label={`Selected: ${label}`}>{selected.map(email=><span className="recipient-chip" key={email}><span><strong>{options.find(c=>c.email===email)?.name||email}</strong>{options.some(c=>c.email===email)&&<small>{email}</small>}</span><button type="button" disabled={disabled} aria-label={`Remove ${email}`} onClick={()=>toggle(email)}><X size={14}/></button></span>)}</div>
  <label htmlFor={id}>{label}</label>
  <div className="recipient-search"><Search size={17}/><input id={id} type="search" autoComplete="off" placeholder="Name, station, department, or email" value={query} disabled={disabled} aria-describedby={`${id}-help`} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setError('');setOpen(true);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}/></div>
  <small id={`${id}-help`}>Tick people from the list, or type an email and press Enter.</small>
  {validEmail&&!selected.includes(typed)&&<Button type="button" variant="outline" disabled={disabled||selected.length>=50} onClick={add}><Plus size={15}/>Add email: {typed}</Button>}
  {(open||query)&&<div className="recipient-results" role="group" aria-label={`Matches for ${label}`}>{matches.slice(0,30).map(c=><label className="recipient-option" key={c.email}><input type="checkbox" disabled={disabled||selected.length>=50&&!selected.includes(c.email)} checked={selected.includes(c.email)} onChange={()=>toggle(c.email)}/><span><strong>{c.name}</strong><small>{c.kind==='station'?'Station contact':'User'} · {c.email}</small></span></label>)}{!matches.length&&<p>{validEmail?'Add this email to your recipients.':'No matching contacts. Search another name or enter an email address.'}</p>}</div>}
  {error&&<p role="alert" className="form-message">{error}</p>}
 </div>;
}
