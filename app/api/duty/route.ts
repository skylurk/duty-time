import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { adminServices } from '@/lib/firebase/admin';
import { authenticate, authorizeTarget, getProfile, apiError, fail, readBody, type Actor, HttpError } from '@/lib/server/access';
import { getMonthDays, getSettings, getStations, dayId, blankDay } from '@/lib/server/data';
import { emailReady, queueReport, deliverReport } from '@/lib/server/reports';
import { canCheckIn, cutoffFor, correctionDates, correctedDays, recordedStatus, type AutoCheckout } from '@/lib/cutoff';
import { autoCheckoutUser } from '@/lib/auto-checkout';
import { restDecision } from '@/lib/rest';
import { queueAlert, queueOvertimeAlerts } from '@/lib/alerts';
import { dateKey, TIME_ZONE, zuluLabel, parseTime, splitSession, validateSessions, type DutyDay, type Active, type Audit } from '@/lib/duty';
class RestDenied extends Error { constructor(public uid:string, public day:DutyDay,public lastEnd:number,public eligibleAt:number|null,public stationId:string,message:string){super(message);} }
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const identifier = z.string().min(1).max(128).regex(/^[^/]+$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('checkin'), requestId: z.uuid(), stationId: identifier, notes: z.string().max(2000).default(''), time: clock.optional() }),
  z.object({ action: z.literal('checkout'), requestId: z.uuid(), time: clock.optional(), closeDay: z.boolean().default(false) }),
  z.object({ action: z.literal('close'), requestId: z.uuid() }),
  z.object({ action: z.literal('request'), requestId: z.uuid(), date, start: clock, end: clock, stationId: identifier, reason: z.string().trim().min(5, 'Please explain why the duty was not logged.').max(2000) }),
  z.object({ action: z.enum(['approve', 'reject']), requestId: z.uuid(), uid: identifier, date, revision: z.number().int().nonnegative(), reason: z.string().trim().max(2000).default('') }),
  z.object({ action: z.literal('actualCheckout'), requestId: z.uuid(), uid: identifier, date, revision: z.number().int().nonnegative(), autoCheckoutId: z.string().min(1).max(300).regex(/^[^/]+$/), endDate: date, end: clock, reason: z.string().trim().min(5, 'Please explain the actual checkout time.').max(2000) }),
  z.object({ action: z.literal('edit'), requestId: z.uuid(), uid: identifier, date, revision: z.number().int().nonnegative(), sessionId: identifier, start: clock, end: clock, reason: z.string().trim().min(5, 'Please give a reason for the edit.').max(2000) }),
]);
export async function GET(request: NextRequest) {
  try {
    const actor = await authenticate(request), uid = request.nextUrl.searchParams.get('uid') || actor.profile.uid;
    const target = await authorizeTarget(actor, uid);
    const month = request.nextUrl.searchParams.get('month') || dateKey().slice(0, 7);
    const { db } = adminServices();
    const [days, state, stations, settings, managers, teamRows, company, reports, todaySnapshot] = await Promise.all([
      getMonthDays(uid, month), db.collection('duty_time_state').doc(uid).get(), getStations(actor.profile.company), getSettings(actor.profile.company), Promise.all(actor.profile.lineManagerUids.map(id=>getProfile(id))), actor.profile.isLineManager || actor.isAdmin ? db.collection('duty_time_user_data').where('lineManagerUids', 'array-contains', actor.profile.uid).get() : Promise.resolve(null), db.collection('company').doc(actor.profile.company).get(), db.collection('duty_time_reports').where('uid', '==', uid).get(), db.collection('duty_time_days').doc(dayId(uid, dateKey())).get(),
    ]);
    const pendingIds:string[]=state.data()?.pendingAutoCheckoutIds||[];
    const pendingRecords=pendingIds.length?await db.getAll(...pendingIds.map(id=>db.collection('duty_time_auto_checkouts').doc(id))):[];
    const pendingAutoCheckouts=pendingRecords.filter(d=>d.exists&&d.data()?.uid===uid&&d.data()?.pending).map(d=>({id:d.id,date:d.data()!.affectedDates[0],cutoffAt:d.data()!.cutoffAt}));
    const auditDate = request.nextUrl.searchParams.get('date');
    let audit: Audit[] = [];
    if (auditDate) { fail(/^\d{4}-\d{2}-\d{2}$/.test(auditDate), 'Choose a valid date.'); const docs = await db.collection('duty_time_audit').where('dayId', '==', dayId(uid, auditDate)).get(); audit = docs.docs.map(d => d.data() as Audit).sort((a, b) => b.at - a.at); }
    const currentDate=dateKey(Date.now(),state.data()?.active?.timeZone||state.data()?.timeZone||TIME_ZONE);
    const localToday=currentDate===dateKey()?todaySnapshot:await db.collection('duty_time_days').doc(dayId(uid,currentDate)).get();
    return NextResponse.json({ month, timeZone:state.data()?.active?.timeZone||state.data()?.timeZone||TIME_ZONE,lastStationId:state.data()?.stationId||null, pendingAutoCheckouts, todayDay: localToday.exists ? localToday.data() : null, profile: actor.profile, viewingProfile: target, isAdmin: actor.isAdmin, managers: managers.filter(p => p.company === actor.profile.company).map(p => ({ uid: p.uid, name: p.name })), stations: stations.filter(s => s.active), settings, days, active: state.data()?.active ? { ...state.data()!.active, ...cutoffFor(state.data()!.active.start, target.cutoffTime,state.data()!.active.timeZone) } : null, team: teamRows ? (await Promise.all(teamRows.docs.filter(d=>d.data().company===actor.profile.company && d.id!==actor.profile.uid).map(d=>getProfile(d.id)))).filter(p=>p.enabled) : [], companyName: company.data()?.company_name || 'Your company', reportDeliveryReady: emailReady(), reporting: { queued: reports.docs.filter(d => ['queued', 'sending'].includes(d.data().state)).length, failed: reports.docs.filter(d => d.data().state === 'failed').length, blocked: reports.docs.filter(d => d.data().state === 'blocked').length }, audit }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await authenticate(request), input = schema.parse(await readBody(request));
    const { db } = adminServices(), now = Date.now(), today = dateKey(now);
    const target = 'uid' in input ? await authorizeTarget(actor, input.uid, input.action !== 'actualCheckout') : actor.profile;
    const dueReports = await autoCheckoutUser(db,target.uid,now);
    await Promise.all(dueReports.map(deliverReport));
    const settings = await getSettings(actor.profile.company);
    const stations = 'stationId' in input ? await getStations(actor.profile.company) : [];
    const station = 'stationId' in input ? stations.find(s => s.id === input.stationId && s.active) : null;
    if ('stationId' in input) fail(station, 'Please choose an active work station.');
    if ('time' in input && input.time) fail(settings.allowManualTimes, 'Manual times are disabled by your administrator.');
    const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const opRef = db.collection('duty_time_operations').doc(`${actor.profile.uid}_${input.requestId}`);
    const stateRef = db.collection('duty_time_state').doc(target.uid);
    const result = await db.runTransaction(async tx => {
      const [op, stateSnap] = await Promise.all([tx.get(opRef), tx.get(stateRef)]);
      if (op.exists) { fail(op.data()?.action === input.action && op.data()?.payloadHash === payloadHash, 'This request identifier was already used.'); return op.data()!.result as { reportIds: string[]; message: string }; }
      const active = (stateSnap.data()?.active || null) as Active | null;
      const timeZone=station?.timeZone||active?.timeZone||stateSnap.data()?.timeZone||TIME_ZONE, today=dateKey(now,timeZone);
      const reportIds: string[] = [];
      const save = (day: DutyDay, kind?: string) => {
        day.revision += 1;
        tx.set(db.collection('duty_time_days').doc(day.id), { ...day, audit: [], updatedAt: now });
        if (kind) { const id = `${input.requestId}_${day.date}`; queueReport(tx, id, day, target, kind); reportIds.push(id); }
      };
      let message = '';
      if (input.action === 'checkin') {
        fail(canCheckIn(now,target.cutoffTime,timeZone), 'Your daily cutoff has passed. Ask your line manager to change the cutoff before checking in.');
        fail(!active, 'You are already checked in. Refresh to see your active session.', 409);
        const start = input.time ? parseTime(today, input.time,timeZone) : now;
        fail(start <= now, 'Check-in cannot be in the future.');
        const history=await tx.get(db.collection('duty_time_days').orderBy(FieldPath.documentId()).startAt(`${target.uid}_`).endAt(`${target.uid}_\uf8ff`));
        const prior=history.docs.map(d=>d.data() as DutyDay).filter(d=>d.uid===target.uid&&d.company===target.company);
        fail(prior.filter(d=>['recorded','pending_checkout'].includes(d.status)).every(d=>d.sessions.every(s=>s.end<=start)), 'Check-in overlaps an existing session.');
        const rest=restDecision(prior,start,timeZone);
        if(rest)throw new RestDenied(target.uid,blankDay(target.uid,target.company,today),rest.lastEnd,rest.eligibleAt,station!.id,rest.message+(rest.eligibleAt?` Eligible at ${zuluLabel(rest.eligibleAt)}.`:''));
        const ref = db.collection('duty_time_days').doc(dayId(target.uid, today)), snap = await tx.get(ref);
        const day = snap.exists ? snap.data() as DutyDay : blankDay(target.uid, target.company, today);
        fail(day.status !== 'pending', 'This day has a pending request. Ask your manager to review it first.');
        fail(!day.closed, 'This day has been closed. Ask your manager to correct its records if necessary.');
        fail(day.sessions.every(s => s.end <= start), 'Check-in overlaps an existing session.');
        if (day.status === 'rejected') { day.sessions = []; day.status = 'recorded'; }
        fail(day.sessions.length < 48, 'This day has reached the session limit.');
        tx.set(stateRef, { uid: target.uid, company: target.company, timeZone, stationId:station!.id, active: { id: input.requestId, date: today, start, ...cutoffFor(start,target.cutoffTime,timeZone), timeZone, stationId: station!.id, station: station!.name, notes: input.notes }, updatedAt: now }, { merge: true });
        message = 'You’re checked in. Your timer will keep running when you leave this page.';
      } else if (input.action === 'checkout') {
        fail(active, 'You have no active session. Refresh your duty records.', 409);
        const end = input.time ? parseTime(today, input.time,timeZone) : now;
        fail(end <= now && end > active.start, 'Check-out must follow check-in and cannot be in the future.');
        const pieces = splitSession(active, end);
        fail(pieces.length <= 31, 'This session spans more than 31 days. Ask your administrator to correct it.');
        const snapshots = await tx.getAll(...pieces.map(p => db.collection('duty_time_days').doc(dayId(target.uid, p.date))));
        const updated = pieces.map((piece, i) => {
          const day = snapshots[i].exists ? snapshots[i].data() as DutyDay : blankDay(target.uid, target.company, piece.date);
          fail(day.status !== 'pending' && !day.closed, 'This session conflicts with a pending or closed day.');
          day.sessions = [...(day.status === 'rejected' ? [] : day.sessions), piece.session].sort((a, b) => a.start - b.start);
          fail(day.sessions.length <= 48, 'This day has reached the session limit.');
          try { validateSessions(day.sessions, day.date, now); } catch (e) { throw new HttpError(400, (e as Error).message); }
          day.status = recordedStatus(day.sessions); fail(!input.closeDay || day.status === 'recorded', 'Record the actual checkout for pending sessions before closing the day.'); day.closed = input.closeDay;
          return day;
        });
        for (const day of updated) save(day, input.closeDay ? 'closed' : 'checkout');
        tx.set(stateRef, { uid: target.uid, company: target.company, active: null, updatedAt: now }, { merge: true });
        message = input.closeDay ? 'Your day is closed. Your final report is queued.' : 'You’re checked out. Your duty report is queued.';
      } else if (input.action === 'close') {
        fail(!active, 'Check out before closing your day.');
        const ref = db.collection('duty_time_days').doc(dayId(target.uid, today)), snap = await tx.get(ref);
        fail(snap.exists, 'There are no sessions to close today.');
        const day = snap.data() as DutyDay;
        fail(day.status === 'recorded' && day.sessions.length > 0 && !day.closed, 'This day cannot be closed.');
        day.closed = true; save(day, 'closed'); message = 'Your day is closed. Your final report is queued.';
      } else if (input.action === 'request') {
        fail(input.date <= today, 'Missed entries cannot be in the future.');
        const start = parseTime(input.date, input.start,timeZone), end = parseTime(input.date, input.end,timeZone);
        const day = blankDay(target.uid, target.company, input.date);
        day.sessions = [{ id: input.requestId, start, end, timeZone, stationId: station!.id, station: station!.name, notes: input.reason }];
        try { validateSessions(day.sessions, input.date, now); } catch (e) { throw new HttpError(400, (e as Error).message); }
        fail(!active || input.date < active.date, 'This date overlaps your active session. Check out first.');
        const snap = await tx.get(db.collection('duty_time_days').doc(day.id));
        fail(!snap.exists, 'This date already has duty data. Ask your manager to edit it.', 409);
        fail(target.lineManagerUids.length > 0, 'Ask an administrator to assign your line manager first.');
        day.status = 'pending'; day.reason = input.reason; save(day); message = 'Your missed entry is awaiting your line manager’s approval.';
      } else if (input.action === 'actualCheckout') {
        const autoRef=db.collection('duty_time_auto_checkouts').doc(input.autoCheckoutId);
        const autoSnap=await tx.get(autoRef),record=autoSnap.data() as AutoCheckout|undefined;
        fail(record && record.uid===target.uid && record.company===target.company, 'This automatic checkout could not be found.',404);
        fail(record.pending, 'The actual checkout has already been recorded. Refresh this day.',409);
        const end=parseTime(input.endDate,input.end,record.active.timeZone);
        let dates:string[];
        try{dates=correctionDates(record,end);}catch(e){throw new HttpError(400,(e as Error).message);}
        fail(dates.includes(input.date),'The selected day does not belong to this duty.',400);
        const snapshots=await tx.getAll(...dates.map(d=>db.collection('duty_time_days').doc(dayId(target.uid,d))));
        const existing=snapshots.filter(d=>d.exists).map(d=>d.data() as DutyDay);
        fail(existing.find(d=>d.date===input.date)?.revision===input.revision,'This day changed. Refresh before setting the actual checkout.',409);
        let days:DutyDay[];
        try{days=correctedDays(record,existing,end,now,active);}catch(e){throw new HttpError(400,(e as Error).message);}
        for(const day of days){
          save(day,'actual_checkout');
          tx.create(db.collection('duty_time_audit').doc(`${input.requestId}_${day.date}`),{dayId:day.id,uid:target.uid,company:target.company,actorUid:actor.profile.uid,actorName:actor.profile.name,at:now,action:'actual_checkout',reason:input.reason,before:existing.find(d=>d.date===day.date)?.sessions||[],after:day.sessions,statusAfter:day.status});
        }
        tx.set(stateRef,{pendingAutoCheckoutIds:FieldValue.arrayRemove(record.id)},{merge:true});
        tx.update(autoRef,{pending:false,actualEnd:end,resolvedAt:now,resolvedBy:actor.profile.uid,reason:input.reason});
        message='Actual checkout saved. Hours have been recalculated and corrected reports queued.';
      } else {
        const ref = db.collection('duty_time_days').doc(dayId(target.uid, input.date)), snap = await tx.get(ref);
        fail(snap.exists, 'This duty record could not be found.', 404);
        const day = snap.data() as DutyDay;
        fail(day.revision === input.revision, 'This record changed. Refresh before reviewing it.', 409);
        const before = structuredClone(day.sessions);
        if (input.action === 'edit') {
          fail(['recorded','pending_checkout'].includes(day.status), 'Only recorded sessions can be edited. Review pending requests first.');
          const session = day.sessions.find(s => s.id === input.sessionId);
          fail(session, 'This session could not be found.', 404);
          fail(!session.autoCheckoutPending, 'Use Set actual checkout to resolve this automatic checkout.');
          session.start = parseTime(input.date, input.start,session.timeZone); session.end = parseTime(input.date, input.end,session.timeZone);
          try { validateSessions(day.sessions, day.date, now); } catch (e) { throw new HttpError(400, (e as Error).message); }
          fail(!active || day.sessions.every(s => s.end <= active.start || s.start > now), 'The edit overlaps an active session.');
          day.sessions.sort((a, b) => a.start - b.start); save(day, 'edited'); message = 'Hours updated. The original and edited values are in the audit history.';
        } else {
          fail(day.status === 'pending', 'This request has already been reviewed.', 409);
          if (input.action === 'reject') fail(input.reason.trim().length >= 5, 'Please give a reason for rejecting this request.');
          day.status = input.action === 'approve' ? 'recorded' : 'rejected';
          save(day, input.action === 'approve' ? 'approved' : undefined); message = input.action === 'approve' ? 'The missed entry was approved.' : 'The missed entry was rejected.';
        }
        tx.create(db.collection('duty_time_audit').doc(input.requestId), { dayId: day.id, uid: target.uid, company: target.company, actorUid: actor.profile.uid, actorName: actor.profile.name, at: now, action: input.action, reason: input.reason || 'Approved missed entry', before, after: day.sessions, statusAfter: day.status });
      }
      const result = { reportIds, message };
      tx.create(opRef, { action: input.action, payloadHash, actorUid: actor.profile.uid, createdAt: now, result });
      return result;
    });
    const alertIds=await queueOvertimeAlerts(db,target.uid,now,[...('date' in input?[input.date]:[]),...result.reportIds.map(id=>id.slice(-10))]);
    const delivery = await Promise.all([...result.reportIds,...alertIds].map(id => deliverReport(id)));
    return NextResponse.json({ ...result, delivery });
  } catch (error) { if(error instanceof RestDenied){
    try{const id=await queueAlert(adminServices().db,error.uid,error.day,'rest_alert',error.message,`${error.day.date}_${error.lastEnd}_${createHash('sha256').update(error.stationId).digest('hex').slice(0,12)}`,[error.stationId]);await deliverReport(id);}catch{console.error('Rest alert could not be queued or delivered.');}
    return NextResponse.json({error:error.message,eligibleAt:error.eligibleAt},{status:403});
  } if (error instanceof Error && /Choose a valid/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 }); return apiError(error); }
}
