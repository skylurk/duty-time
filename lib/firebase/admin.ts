import 'server-only';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
export function adminServices() {
  let app = getApps().find(a => a.name === 'duty-time-server');
  if (!app) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error('Firebase server credentials are not configured.');
    const account = JSON.parse(raw);
    if (account.project_id !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) throw new Error('Firebase project configuration does not match.');
    app = initializeApp({ credential: cert(account), projectId: account.project_id }, 'duty-time-server');
  }
  return { auth: getAuth(app), db: getFirestore(app) };
}
