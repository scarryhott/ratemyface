import { NextRequest, NextResponse } from "next/server";
import { currentOAuthUser } from "../../../lib/supabaseAuth";
import { consumeCredits, creditBalance, ensureSignupCreditGrant } from "../../../lib/stripeBilling";
import { PERSONAL_ACTION_COST, REPORT_ACTION_COST, connections, history, profile, recommendationFeedback, saveInteraction, saveRecommendation, savedItems, updateProfile } from "../../../lib/personalNetwork";

export const runtime="nodejs";
const denied=(balance:number,cost:number)=>NextResponse.json({ok:false,error:"credits_required",message:"Persistent Rate My Face personal network uses metered credits. The preference was not saved or loaded. Buy credits with createCreditCheckoutSession, then retry.",required_credits:cost,balance,checkout_action:"createCreditCheckoutSession"},{status:402});
async function user(req:NextRequest){return currentOAuthUser(req)}
async function charge(uid:string,cost:number,action:string){
  await ensureSignupCreditGrant(uid);
  const r=await consumeCredits(uid,cost,action);
  return r.ok?null:denied(r.balance,cost);
}

export async function GET(req:NextRequest){
 const u=await user(req); if(!u)return NextResponse.json({ok:false,error:"oauth_required"},{status:401});
 const mode=req.nextUrl.searchParams.get("mode")||"profile"; const cost=mode==="report"?REPORT_ACTION_COST:PERSONAL_ACTION_COST; const d=await charge(u.id,cost,`personal:${mode}`); if(d)return d;
 const limit=Number(req.nextUrl.searchParams.get("limit")||20);
 let data:any;
 if(mode==="history")data=await history(u.id,limit); else if(mode==="saved")data=await savedItems(u.id,limit); else if(mode==="connections")data=await connections(u.id); else if(mode==="report"){data={profile:await profile(u.id),history:await history(u.id,20),saved:await savedItems(u.id,20),connections:await connections(u.id)};} else data=await profile(u.id);
 return NextResponse.json({ok:true,mode,data,credits_charged:cost,credits_remaining:await creditBalance(u.id)});
}

export async function POST(req:NextRequest){
 const u=await user(req); if(!u)return NextResponse.json({ok:false,error:"oauth_required"},{status:401}); const b=await req.json().catch(()=>({})); const op=String(b.operation||""); const d=await charge(u.id,PERSONAL_ACTION_COST,op||"personal:write"); if(d)return d; let result:any;
 if(op==="update_profile")result=await updateProfile(u.id,b.profile&&typeof b.profile==="object"?b.profile:{});
 else if(op==="save_interaction")result=await saveInteraction(u.id,String(b.kind||"chat"),String(b.summary||"").slice(0,1000),b.data&&typeof b.data==="object"?b.data:{});
 else if(op==="save_recommendation")result=await saveRecommendation(u.id,{item_type:b.item_type,title:b.title,url:b.url,data:b.data});
 else if(op==="recommendation_feedback")result=await recommendationFeedback(u.id,Number(b.recommendation_id),String(b.feedback||"").slice(0,200));
 else return NextResponse.json({ok:false,error:"invalid_operation"},{status:400});
 return NextResponse.json({ok:true,operation:op,result,credits_charged:PERSONAL_ACTION_COST,credits_remaining:await creditBalance(u.id)});
}
