import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminServices } from '@/lib/firebase/admin';
import { authenticate, apiError, fail, readBody } from '@/lib/server/access';
import { deliverReport } from '@/lib/server/reports';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const actor = await authenticate(request); fail(actor.isAdmin, 'Administrator access is required.', 403);
    const { id } = z.object({ id: z.string().min(1).max(200).regex(/^[^/]+$/) }).parse(await readBody(request));
    const report = await adminServices().db.collection('duty_time_reports').doc(id).get();
    fail(report.exists && report.data()?.company === actor.profile.company, 'This report could not be found.', 404);
    if(report.data()?.state==='blocked' && report.data()?.attempts>=10)await report.ref.update({attempts:0,nextAttemptAt:0});
    return NextResponse.json({ state: await deliverReport(id) });
  } catch (error) { return apiError(error); }
}
