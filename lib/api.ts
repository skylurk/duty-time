'use client';
import { clientAuth } from '@/lib/firebase/client';
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const user = clientAuth().currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
