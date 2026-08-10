import { NextRequest,NextResponse } from 'next/server';
import { enqueueSignal } from '../../../../lib/operatorAgent';
import { operatorRequestAuthorized } from '../../../../lib/operatorOwnerAuth';
export const runtime='nodejs';
export async function POST(r:NextRequest){const auth=await operatorRequestAuthorized(r);if(!auth.ok)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});const b=await r.json().catch(()=>({}));const authority=Math.max(0,Math.min(6,Number(b.requested_authority??1))) as 0|1|2|3|4|5|6;const signal=await enqueueSignal(String(b.source||auth.actor||'external').slice(0,80),String(b.kind||'signal').slice(0,80),b.payload&&typeof b.payload==='object'?b.payload:{message:String(b.message||'')},authority);return NextResponse.json({ok:true,signal,actor:auth.actor});}
