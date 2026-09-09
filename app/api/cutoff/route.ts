import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, authorizeTarget, fail, readBody, apiError } from '@/lib/server/access';
import { adminServices } from '@/lib/firebase/admin';
import { cutoffFor } from '@/lib/cutoff';
import { dateKey, parseTime } from '@/lib/duty';
import { DEFAULT_CUTOFF } from '@/lib/cutoff';
import { autoCheckoutUser } from '@/lib/auto-checkout';
import { deliverReport } from '@/lib/server/reports';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  const actor=await authenticate(request);
  const input=z.discriminatedUnion('action',[
   z.object({action:z.literal('set'),uid:z.string().min(1).max(128).regex(/^[^/]+$/),cutoffTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()}),
   z.object({action:z.literal('sync')})
  ]).parse(await readBody(request));
  const {db}=adminServices();
  if(input.action==='sync'){const ids=await autoCheckoutUser(db,actor.profile.uid);await Promise.all(ids.map(deliverReport));return NextResponse.json({changed:!!ids.length});}
  const target=await authorizeTarget(actor,input.uid,!actor.isAdmin);
  fail(actor.isAdmin||actor.profile.isLineManager,'Only a line manager or administrator can set cutoff times.',403);
  const ref=db.collection('duty_time_user_data').doc(target.uid),stateRef=db.collection('duty_time_state').doc(target.uid);
  await db.runTransaction(async tx=>{
   const [before,state]=await Promise.all([tx.get(ref),tx.get(stateRef)]);
   fail(before.exists&&before.data()?.company===actor.profile.company,'User membership changed. Refresh and try again.',409);
   if(!actor.isAdmin)fail(before.data()?.lineManagerUids?.includes(actor.profile.uid),'This user is no longer assigned to you.',403);
   const active=state.data()?.active;
   if(active)fail(parseTime(dateKey(active.start,active.timeZone),input.cutoffTime||DEFAULT_CUTOFF,active.timeZone)>active.start, 'The cutoff must be after the current check-in. Check out this session before choosing an earlier cutoff.');
   tx.update(ref,{cutoffTime:input.cutoffTime,updatedAt:Date.now(),updatedBy:actor.profile.uid});
   if(active)tx.update(stateRef,{active:{...active,...cutoffFor(active.start,input.cutoffTime,active.timeZone)},updatedAt:Date.now()});
   tx.create(db.collection('duty_time_admin_audit').doc(),{uid:target.uid,company:target.company,actorUid:actor.profile.uid,action:'cutoff',before:before.data()?.cutoffTime??null,after:input.cutoffTime,at:Date.now()});
  });
  const ids=await autoCheckoutUser(db,target.uid);await Promise.all(ids.map(deliverReport));
  return NextResponse.json({message:'Cutoff saved. It also applies to any currently open session.'});
 }catch(error){return apiError(error);}
}
