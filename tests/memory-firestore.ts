import type { Firestore } from 'firebase-admin/firestore';
// Minimal transactional test double: callbacks commit atomically and roll back on failure.
export function memoryFirestore(initial:Record<string,unknown>){
 const rows=new Map(Object.entries(structuredClone(initial)));let tail=Promise.resolve();
 const reference=(path:string)=>({path,id:path.split('/').at(-1)!});
 const snapshot=(ref:{path:string})=>({exists:rows.has(ref.path),id:ref.path.split('/').at(-1)!,data:()=>structuredClone(rows.get(ref.path))});
 const query=(name:string,key:string,value:unknown)=>({query:true,get:async()=>({docs:[...rows.keys()].filter(path=>path.startsWith(name+'/')&&(rows.get(path) as Record<string,unknown>)[key]===value).map(path=>snapshot(reference(path)))})});
 const db={collection:(name:string)=>({where:(key:string,_op:string,value:unknown)=>query(name,key,value),doc:(id:string)=>({...reference(`${name}/${id}`),get:async()=>snapshot(reference(`${name}/${id}`)),update:async(data:Record<string,unknown>)=>apply('update',`${name}/${id}`,data)})}),runTransaction:async<T>(callback:(tx:unknown)=>Promise<T>)=>{
  let unlock!:()=>void;const previous=tail;tail=new Promise<void>(r=>{unlock=r;});await previous;
  const writes:{method:string;path:string;data:Record<string,unknown>}[]=[];
  const tx={get:async(ref:{path:string;query?:boolean;get?:()=>Promise<unknown>})=>ref.query?ref.get!():snapshot(ref),getAll:async(...refs:{path:string}[])=>refs.map(snapshot),create:(ref:{path:string},data:Record<string,unknown>)=>{if(rows.has(ref.path))throw new Error('Already exists');writes.push({method:'create',path:ref.path,data});},set:(ref:{path:string},data:Record<string,unknown>)=>writes.push({method:'set',path:ref.path,data}),update:(ref:{path:string},data:Record<string,unknown>)=>writes.push({method:'update',path:ref.path,data})};
  try{const result=await callback(tx);for(const w of writes)apply(w.method,w.path,w.data);return result;}finally{unlock();}
 }};
 function apply(method:string,path:string,data:Record<string,unknown>){const previous=(rows.get(path)||{}) as Record<string,unknown>;const resolved=Object.fromEntries(Object.entries(data).map(([key,value])=>{if(value&&typeof value==='object'&&value.constructor.name==='ArrayUnionTransform')return[key,[...new Set([...(previous[key] as unknown[]||[]),...(value as {elements:unknown[]}).elements])]];return[key,structuredClone(value)];}));rows.set(path,method==='update'?{...previous,...resolved}:resolved);}
 return {db:db as unknown as Firestore,rows};
}
