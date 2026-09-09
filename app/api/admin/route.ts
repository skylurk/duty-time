import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { adminServices } from '@/lib/firebase/admin';
import { authenticate, authorizeTarget, companyProfiles, apiError, fail, readBody } from '@/lib/server/access';
import { getSettings, getStations } from '@/lib/server/data';
import { validTimeZone, TIME_ZONE } from '@/lib/duty';
import { readStationContacts } from '@/lib/station-contacts';
import { emailReady } from '@/lib/server/reports';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uid = z.string().min(1).max(128).regex(/^[^/]+$/);
const roleFields = { position: z.string().trim().min(1).max(100), isLineManager: z.boolean(), lineManagerUids: z.array(uid).max(20), enabled: z.boolean() };
const schema = z.discriminatedUnion('action', [
  z.object({action:z.literal('alertRecipients'),alertEmails:z.array(z.email()).max(50)}),
  z.object({ action: z.literal('settings'), allowManualTimes: z.boolean() }),
  z.object({ action: z.literal('station'), id: uid.optional(), name: z.string().trim().min(2).max(150), country: z.string().trim().max(100).default(''), timeZone:z.string().refine(validTimeZone,'Choose a valid IANA time zone.').default(TIME_ZONE), active: z.boolean() }),
  z.object({ action: z.literal('user'), uid, ...roleFields }),
  z.object({ action: z.literal('createUser'), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), email: z.email(), password: z.string().min(12).max(128), department: z.string().trim().min(1).max(100), ...roleFields }),
  z.object({ action: z.literal('password'), uid, password: z.string().min(12).max(128) }),
]);
export async function GET(request: NextRequest) {
  try {
    const actor = await authenticate(request); fail(actor.isAdmin, 'Administrator access is required.', 403);
    const { db } = adminServices();
    const [users, stations, settings, positions, reports, contacts] = await Promise.all([companyProfiles(actor.profile.company), getStations(actor.profile.company), getSettings(actor.profile.company), db.collection('position').get(), db.collection('duty_time_reports').where('company', '==', actor.profile.company).get(), readStationContacts(db,actor.profile.company)]);
    const alertContacts=[...users.filter(u=>u.enabled&&u.email).map(u=>({name:u.name,email:u.email,kind:'user'})),...contacts.filter(c=>c.active!==false&&c.email&&stations.some(s=>s.id===c.stationId)).map(c=>({name:`${stations.find(s=>s.id===c.stationId)!.name} — ${c.name}`,email:c.email,kind:'station'}))];
    return NextResponse.json({ users, stations, settings, alertContacts, positions: positions.docs.map(d => String(d.data().title || '')).filter(Boolean), reportDeliveryReady: emailReady(), reports: reports.docs.filter(d => d.data().state !== 'sent').map(d => { const v = d.data(); return { id: d.id, name: v.name, date: v.date, state: v.state, reason: v.blockedReason || '' }; }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await authenticate(request); fail(actor.isAdmin, 'Administrator access is required.', 403);
    const input = schema.parse(await readBody(request)), { db, auth } = adminServices(), company = actor.profile.company;
    if(input.action==='alertRecipients'){
      await db.collection('duty_time_settings').doc(company).set({alertEmails:[...new Set(input.alertEmails.map(email=>email.trim().toLowerCase()))],updatedBy:actor.profile.uid,updatedAt:Date.now()},{merge:true});
    } else if (input.action === 'settings') {
      await db.collection('duty_time_settings').doc(company).set({ allowManualTimes: input.allowManualTimes, updatedBy: actor.profile.uid, updatedAt: Date.now() }, { merge: true });
    } else if (input.action === 'station') {
      const stations = await getStations(company);
      const existing = input.id ? stations.find(s => s.id === input.id) : undefined;
      if (input.id) fail(existing, 'This station could not be found.', 404);
      const id = existing?.source === 'shared' ? `${company}_${input.id}` : input.id || randomUUID();
      await db.collection('duty_time_stations').doc(id).set({ company, name: input.name, country: input.country, timeZone:input.timeZone, active: input.active, sharedStationId: existing?.source === 'shared' ? input.id : null, updatedBy: actor.profile.uid, updatedAt: Date.now() }, { merge: true });
    } else if (input.action === 'password') {
      await authorizeTarget(actor, input.uid);
      await auth.updateUser(input.uid, { password: input.password });
      await auth.revokeRefreshTokens(input.uid);
    } else {
      const profiles = await companyProfiles(company);
      const managers = [...new Set(input.lineManagerUids)];
      fail(managers.every(id => profiles.some(p => p.uid === id && p.isLineManager && p.enabled)), 'Select active line managers from your company.');
      if (input.action === 'user') {
        const target = await authorizeTarget(actor, input.uid);
        fail(!managers.includes(input.uid), 'A user cannot be their own line manager.');
        fail(input.uid !== actor.profile.uid || input.enabled, 'You cannot disable your own access.');
        if (!input.isLineManager || !input.enabled) fail(!profiles.some(p => p.lineManagerUids.includes(input.uid)), 'Reassign this manager’s team before removing their manager role or access.');
        const ref = db.collection('duty_time_user_data').doc(input.uid);
        await db.runTransaction(async tx => {
          const before = await tx.get(ref);
          const data = { uid: input.uid, company, position: input.position, isLineManager: input.isLineManager, lineManagerUids: managers, enabled: input.enabled, updatedBy: actor.profile.uid, updatedAt: Date.now() };
          tx.set(ref, data, { merge: true });
          tx.create(db.collection('duty_time_admin_audit').doc(), { actorUid: actor.profile.uid, company, uid: target.uid, action: 'user', before: before.data() || {}, after: data, at: Date.now() });
        });
      } else {
        const user = await auth.createUser({ email: input.email, password: input.password, displayName: `${input.firstName} ${input.lastName}`, disabled: false });
        try {
          const batch = db.batch();
          batch.create(db.collection('users_new').doc(user.uid), { uid: user.uid, company, first_name: input.firstName, last_name: input.lastName, email_address: input.email, department: input.department, position: input.position, type_of_user: 'company', profile_photo: '', license: 'NONE', phone_number: '0', hours_on_type: '0', pic_hours_on_type: '0', total_hours: '0', total_pic_hours: '0' });
          batch.create(db.collection('duty_time_user_data').doc(user.uid), { uid: user.uid, company, position: input.position, isLineManager: input.isLineManager, lineManagerUids: managers, enabled: input.enabled, createdBy: actor.profile.uid, createdAt: Date.now() });
          await batch.commit();
        } catch (error) { await auth.deleteUser(user.uid); throw error; }
      }
    }
    return NextResponse.json({ message: input.action === 'createUser' ? 'User created. They can sign in with their new credentials.' : input.action === 'password' ? 'The shared Firebase password was updated and existing sessions revoked.' : 'Changes saved.' });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'auth/email-already-exists') return NextResponse.json({ error: 'This email already has a Firebase account. Use its existing profile.' }, { status: 409 });
    return apiError(error);
  }
}
