import { NextRequest,NextResponse } from 'next/server';
import { runOneSignal } from '../../../../lib/operatorAgent';
import { operatorRequestAuthorized } from '../../../../lib/operatorOwnerAuth';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(r:NextRequest){const auth=await operatorRequestAuthorized(r,{allowCron:true});if(!auth.ok)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});try{return NextResponse.json({...await runOneSignal(),actor:auth.actor});}catch(e:any){return NextResponse.json({ok:false,error:String(e?.message||e)},{status:500});}}
export async function GET(r:NextRequest){return POST(r);}
