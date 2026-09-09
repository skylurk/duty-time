import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { adminServices } from '@/lib/firebase/admin';
import type { Profile } from '@/lib/duty';
import { canReview, canView } from '@/lib/policy';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function fail(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new HttpError(status, message); }
export async function getProfile(uid: string): Promise<Profile> {
  const { db } = adminServices();
  const [direct, extra] = await Promise.all([db.collection('users_new').doc(uid).get(), db.collection('duty_time_user_data').doc(uid).get()]);
  let user = direct.exists && direct.data()?.uid === uid ? direct.data()! : null;
  if (!user) {
    const shared = await db.collection('users_new').where('uid', '==', uid).limit(2).get();
    fail(shared.size === 1, 'Your account needs a unique users_new profile. Please contact your administrator.', 403);
    user = shared.docs[0].data();
  }
  const duty = extra.data() || {};
  fail(extra.exists && duty.company === user.company && duty.uid === uid, 'Your DutyTime membership needs administrator setup.', 403);
  fail(typeof user.company === 'string' && user.company.length > 0 && !user.company.includes('/'), 'Your profile needs a company assignment.', 403);
  return { cutoffTime: typeof duty.cutoffTime === 'string' ? duty.cutoffTime : null, uid, company: user.company, firstName: String(user.first_name || ''), lastName: String(user.last_name || ''), name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Team member', email: String(user.email_address || ''), department: String(user.department || ''), position: String(duty.position ?? user.position ?? ''), photo: String(user.profile_photo || ''), isLineManager: duty.isLineManager === true, lineManagerUids: Array.isArray(duty.lineManagerUids) ? duty.lineManagerUids.filter((v: unknown) => typeof v === 'string') : [], enabled: duty.enabled !== false };
}
export async function authenticate(request: NextRequest) {
  const token = request.headers.get('authorization');
  fail(token && token.startsWith('Bearer '), 'Please sign in to continue.', 401);
  let decoded;
  try { decoded = await adminServices().auth.verifyIdToken(token.slice(7), true); }
  catch { throw new HttpError(401, 'Your session has expired. Please sign in again.'); }
  const profile = await getProfile(decoded.uid);
  fail(profile.enabled, 'Your DutyTime access is disabled. Please contact your administrator.', 403);
  // Read current claims on every request so removed admin privileges take effect immediately.
  const record = await adminServices().auth.getUser(decoded.uid);
  return { profile, isAdmin: record.customClaims?.duty_time_admin === true };
}
export type Actor = Awaited<ReturnType<typeof authenticate>>;
export async function authorizeTarget(actor: Actor, uid: string, requireManager = false) {
  const target = uid === actor.profile.uid ? actor.profile : await getProfile(uid);
  fail(target.company === actor.profile.company, 'This user is outside your company.', 403);
  fail(requireManager ? canReview(actor, target) : canView(actor, target), 'You do not have permission to access these duty records.', 403);
  return target;
}
export async function companyProfiles(company: string): Promise<Profile[]> {
  const { db } = adminServices();
  const users = await db.collection('users_new').where('company', '==', company).get();
  const ids = [...new Set(users.docs.map(d => d.data().uid).filter((v): v is string => typeof v === 'string' && v.length > 0))];
  if (!ids.length) return [];
  const extra = await db.getAll(...ids.map(uid => db.collection('duty_time_user_data').doc(uid)));
  const map = new Map(extra.map(d => [d.id, d.data() || {}]));
  const canonical = ids.map(uid => users.docs.find(d => d.id === uid && d.data().uid === uid) || (users.docs.filter(d => d.data().uid === uid).length === 1 ? users.docs.find(d => d.data().uid === uid) : undefined)).filter((d): d is (typeof users.docs)[number] => !!d);
  return canonical.filter(d => map.get(d.data().uid)?.company === company && map.get(d.data().uid)?.uid === d.data().uid).map(d => { const u = d.data(), x = map.get(u.uid) || {}; return { cutoffTime: typeof x.cutoffTime === 'string' ? x.cutoffTime : null, uid: u.uid, company, firstName: String(u.first_name || ''), lastName: String(u.last_name || ''), name: [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Team member', email: String(u.email_address || ''), department: String(u.department || ''), position: String(x.position ?? u.position ?? ''), photo: String(u.profile_photo || ''), isLineManager: x.isLineManager === true, lineManagerUids: Array.isArray(x.lineManagerUids) ? x.lineManagerUids : [], enabled: x.enabled !== false }; });
}
export function apiError(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message || 'Please check the submitted fields.' }, { status: 400 });
  // Never serialize SDK errors, which can include document or credential details.
  console.error('DutyTime request failed:', error instanceof Error ? error.name : 'UnknownError');
  return NextResponse.json({ error: 'The request could not be completed. Please try again.' }, { status: 500 });
}
export async function readBody(request: NextRequest) {
  const raw = await request.text(); fail(raw.length <= 32000, 'The request is too large.', 413);
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'The request must contain valid JSON.'); }
}
