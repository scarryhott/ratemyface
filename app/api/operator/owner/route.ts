import { NextRequest, NextResponse } from "next/server";

function base(){ return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""; }
async function identity(req:NextRequest){
 const token=req.cookies.get("rmf_owner_access")?.value; if(!token||!base())return null;
 const r=await fetch(`${base().replace(/\/$/,"")}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY||""},cache:"no-store"});
 if(!r.ok)return null; return r.json();
}
export async function GET(req:NextRequest){
 const u=await identity(req); if(!u)return NextResponse.json({ok:false,error:"not_authenticated"},{status:401});
 const allowed=(process.env.RMF_OPERATOR_OWNER_EMAIL||"").trim().toLowerCase();
 const email=String(u.email||"").toLowerCase();
 if(!allowed || email!==allowed)return NextResponse.json({ok:false,error:"owner_not_authorized"},{status:403});
 return NextResponse.json({ok:true,owner:{id:u.id,email:u.email,provider:u.app_metadata?.provider||"google"}});
}
export async function DELETE(req:NextRequest){
 const out=NextResponse.json({ok:true,signed_out:true});
 out.cookies.set("rmf_owner_access","",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
 out.cookies.set("rmf_owner_refresh","",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
 return out;
}
