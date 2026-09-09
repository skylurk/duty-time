import 'server-only';
import type { Transaction } from 'firebase-admin/firestore';
import { adminServices } from '@/lib/firebase/admin';
import type { DutyDay, Profile } from '@/lib/duty';
import { enqueueReport, sendReport } from '@/lib/report-worker';
export function emailReady(){return !!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL);}
export function queueReport(transaction:Transaction,id:string,day:DutyDay,profile:Profile,kind:string){enqueueReport(adminServices().db,transaction,id,day,profile,kind);}
export async function deliverReport(id:string){const {db,auth}=adminServices();return sendReport(db,auth,id,{apiKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL});}
