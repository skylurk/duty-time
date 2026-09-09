import type { Profile } from './duty';
type Actor = { profile: Profile; isAdmin: boolean };
export function canReview(actor: Actor, target: Profile): boolean {
  return actor.profile.enabled && actor.profile.company === target.company && actor.profile.uid !== target.uid && (actor.isAdmin || actor.profile.isLineManager && target.lineManagerUids.includes(actor.profile.uid));
}
export function canView(actor: Actor, target: Profile): boolean {
  return actor.profile.enabled && actor.profile.company === target.company && (actor.profile.uid === target.uid || canReview(actor, target));
}
