'use client';
import { useState } from 'react';
export function Avatar({ name, photo, large=false }: { name:string;photo?:string;large?:boolean }) {
 const [failed,setFailed]=useState(false);
 const valid=photo&&/^https:\/\//i.test(photo)&&!failed;
 return <span className={large?'large-avatar':'avatar'}>{valid?<img src={photo} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:name.split(' ').filter(Boolean).map(n=>n[0]).slice(0,2).join('')}{large&&<span/>}</span>;
}
