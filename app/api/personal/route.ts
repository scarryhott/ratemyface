import { NextRequest, NextResponse } from "next/server";
import { currentOAuthUser } from "../../../lib/supabaseAuth";
import { consumeCredits, creditBalance, ensureSignupCreditGrant } from "../../../lib/stripeBilling";
import { PERSONAL_ACTION_COST, REPORT_ACTION_COST, connections, history, savedItems, updateProfile } from "../../../lib/personalNetwork";
import { recordLearningWrite } from "../../../lib/accountLearningPipeline";
import { readProfileUnified, syncPersonalProfileToLegacy } from "../../../lib/accountLearningSync";
import { shapePersonalProfilePayload } from "../../../lib/accountLearningShape";

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
 if(mode==="history")data=await history(u.id,limit);
 else if(mode==="saved")data=await savedItems(u.id,limit);
 else if(mode==="connections")data=await connections(u.id);
 else if(mode==="report"){
  const profile=shapePersonalProfilePayload(await readProfileUnified(u.id));
  data={profile,history:await history(u.id,20),saved:await savedItems(u.id,20),connections:await connections(u.id)};
 } else {
  data=shapePersonalProfilePayload(await readProfileUnified(u.id));
 }
 // Cheap smoke signal for ops: preference reads should appear after GPT auto-invoke.
 if(mode==="profile"||mode==="report"||!["history","saved","connections"].includes(mode)){
  const found=mode==="report"?Boolean(data?.profile?.found):Boolean(data?.found);
  console.info("[account-learning:getPersonalNetwork]",{mode,found,empty:!found});
 }
 return NextResponse.json({ok:true,mode,data,credits_charged:cost,credits_remaining:await creditBalance(u.id)});
}

export async function POST(req:NextRequest){
 const u=await user(req); if(!u)return NextResponse.json({ok:false,error:"oauth_required"},{status:401}); const b=await req.json().catch(()=>({})); const op=String(b.operation||""); const d=await charge(u.id,PERSONAL_ACTION_COST,op||"personal:write"); if(d)return d; let result:any;
 if(op==="update_profile"){
  result=await updateProfile(u.id,b.profile&&typeof b.profile==="object"?b.profile:{});
  const doc=(result?.profile&&typeof result.profile==="object"?result.profile:b.profile)||{};
  await syncPersonalProfileToLegacy(u.id,doc as Record<string,unknown>);
  const pipeline=await recordLearningWrite({userId:u.id,kind:"preference",data:doc as Record<string,unknown>,requireMeaningfulPreference:true});
  // Return shaped profile so a follow-up read is not required to see prefs.
  result={...result, shaped:shapePersonalProfilePayload(result), interaction:pipeline.interaction, recommendation:pipeline.recommendation};
  console.info("[account-learning:updatePersonalNetwork]",{operation:op,found:true,interaction_id:pipeline.interaction?.id??null});
 }
 else if(op==="save_interaction"){
  const data=b.data&&typeof b.data==="object"?b.data:{};
  const pipeline=await recordLearningWrite({userId:u.id,kind:String(b.kind||"chat"),summary:String(b.summary||"").slice(0,1000),data});
  result={...pipeline.interaction, ...pipeline};
 }
 else if(op==="save_recommendation"){
  const rec={item_type:b.item_type,title:b.title,url:b.url,data:b.data&&typeof b.data==="object"?b.data:{}};
  const pipeline=await recordLearningWrite({userId:u.id,kind:"recommendation",summary:String(b.title||b.summary||"").slice(0,1000),data:{...rec.data,title:b.title,url:b.url,item_type:b.item_type},recommendation:rec});
  result={...pipeline.recommendation, ...pipeline};
 }
 else if(op==="recommendation_feedback"){
  const pipeline=await recordLearningWrite({userId:u.id,kind:"feedback",feedback:{recommendation_id:Number(b.recommendation_id),feedback:String(b.feedback||"").slice(0,200)}});
  result={...pipeline.recommendation, ...pipeline};
 }
 else return NextResponse.json({ok:false,error:"invalid_operation"},{status:400});
 return NextResponse.json({ok:true,operation:op,result,credits_charged:PERSONAL_ACTION_COST,credits_remaining:await creditBalance(u.id)});
}
