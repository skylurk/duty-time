'use client';
import { readApiResponse } from './api-response';
import { clientAuth } from '@/lib/firebase/client';
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const user = clientAuth().currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal });
  return readApiResponse<T>(response,path);
}
