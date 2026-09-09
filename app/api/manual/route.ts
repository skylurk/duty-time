import { NextRequest, NextResponse } from 'next/server';
import { authenticate, fail, apiError } from '@/lib/server/access';
import { adminManual } from '@/lib/server/admin-manual';
export async function GET(request:NextRequest){try{const actor=await authenticate(request);fail(actor.isAdmin,'Administrator access is required.',403);return NextResponse.json(adminManual,{headers:{'Cache-Control':'private, no-store'}});}catch(e){return apiError(e);}}
