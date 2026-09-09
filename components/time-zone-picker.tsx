'use client';
import { useEffect, useId, useMemo, useState } from 'react';
const common=['UTC','Africa/Nairobi','Africa/Juba','Africa/Khartoum','Africa/Kampala','Africa/Dar_es_Salaam'];
export function TimeZonePicker({value,onChange,disabled=false}:{value:string;onChange:(zone:string)=>void;disabled?:boolean}){
 const id=useId(),[search,setSearch]=useState(''),[zones,setZones]=useState(common);
 useEffect(()=>{
  const intl=Intl as typeof Intl & {supportedValuesOf?:(key:string)=>string[]};
  if(intl.supportedValuesOf)setZones([...new Set([...common,...intl.supportedValuesOf('timeZone')])].sort());
 },[]);
 const options=useMemo(()=>[...new Set([value,...zones])].map(zone=>{
  let offset='';try{offset=new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeZoneName:'shortOffset'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value.replace('GMT','UTC')||'UTC';}catch{}
  return {zone,label:`${zone.replaceAll('_',' ')} (${offset})`};
 }),[zones,value]);
 const matches=options.filter(o=>o.label.toLowerCase().includes(search.trim().toLowerCase()));
 const selected=options.find(o=>o.zone===value)!;
 return <div className="time-zone-picker"><label htmlFor={`${id}-search`}>Find a time zone<input id={`${id}-search`} type="search" placeholder="Search city, region, or UTC offset" value={search} disabled={disabled} onChange={e=>setSearch(e.target.value)}/></label><label htmlFor={id}>Station time zone<select id={id} required value={value} disabled={disabled} onChange={e=>onChange(e.target.value)} aria-describedby={`${id}-hint`}>
 {!matches.some(o=>o.zone===value)&&<option value={value}>{selected.label} — current selection</option>}
 {matches.map(o=><option key={o.zone} value={o.zone}>{o.label}</option>)}
 </select></label><small id={`${id}-hint`}>{search&&!matches.length?'No matching time zones. Try another city or region. ':'7pm and manager overrides use this station’s local time. '}Offsets shown are current and may change with daylight saving.</small></div>;
}
