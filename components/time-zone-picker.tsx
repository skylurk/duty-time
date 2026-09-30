'use client';
import { useEffect, useId, useMemo, useState } from 'react';
// Browsers such as Safari list only canonical zones (Ouagadougou and Bamako fold into Abidjan), so every African city zone is always offered.
const common=['UTC','Africa/Abidjan','Africa/Accra','Africa/Addis_Ababa','Africa/Algiers','Africa/Asmara','Africa/Bamako','Africa/Bangui','Africa/Banjul','Africa/Bissau','Africa/Blantyre','Africa/Brazzaville','Africa/Bujumbura','Africa/Cairo','Africa/Casablanca','Africa/Ceuta','Africa/Conakry','Africa/Dakar','Africa/Dar_es_Salaam','Africa/Djibouti','Africa/Douala','Africa/El_Aaiun','Africa/Freetown','Africa/Gaborone','Africa/Harare','Africa/Johannesburg','Africa/Juba','Africa/Kampala','Africa/Khartoum','Africa/Kigali','Africa/Kinshasa','Africa/Lagos','Africa/Libreville','Africa/Lome','Africa/Luanda','Africa/Lubumbashi','Africa/Lusaka','Africa/Malabo','Africa/Maputo','Africa/Maseru','Africa/Mbabane','Africa/Mogadishu','Africa/Monrovia','Africa/Nairobi','Africa/Ndjamena','Africa/Niamey','Africa/Nouakchott','Africa/Ouagadougou','Africa/Porto-Novo','Africa/Sao_Tome','Africa/Tripoli','Africa/Tunis','Africa/Windhoek'];
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
