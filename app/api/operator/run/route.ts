import { NextRequest,NextResponse } from 'next/server';
import { runOneSignal } from '../../../../lib/operatorAgent';
export const runtime='nodejs';export const maxDuration=60;
function authorized(r:NextRequest){const secret=process.env.RMF_OPERATOR_SIGNAL_SECRET;const cron=process.env.CRON_SECRET;const auth=r.headers.get('authorization');return (Boolean(secret)&&auth===`Bearer ${secret}`)||(Boolean(cron)&&auth===`Bearer ${cron}`);}
export async function POST(r:NextRequest){if(!authorized(r))return NextResponse.json({ok:false,error:'unauthorized'},{status:401});try{return NextResponse.json(await runOneSignal());}catch(e:any){return NextResponse.json({ok:false,error:String(e?.message||e)},{status:500});}}
export async function GET(r:NextRequest){return POST(r);}
