import express from "express";
import { chromium } from "playwright";
import crypto from "node:crypto";

const app=express(); app.use(express.json({limit:"64kb"}));
const PORT=Number(process.env.PORT||8080);
const TOKEN=process.env.RMF_BROWSER_CONTROL_TOKEN||"";
const PROFILE=process.env.RMF_BROWSER_PROFILE_DIR||"/data/browser-profile";
const ALLOWED=new Set((process.env.RMF_BROWSER_ALLOWED_HOSTS||"chatgpt.com").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));
let context=null;

function authorized(req){ if(!TOKEN)return false; const h=req.headers.authorization||""; const a=Buffer.from(h); const b=Buffer.from(`Bearer ${TOKEN}`); return a.length===b.length&&crypto.timingSafeEqual(a,b); }
function guard(req,res,next){ if(!authorized(req))return res.status(401).json({ok:false,error:"unauthorized"}); next(); }
function allowedUrl(raw){ const u=new URL(raw); if(u.protocol!=="https:")throw new Error("https_required"); const host=u.hostname.toLowerCase(); if(![...ALLOWED].some(x=>host===x||host.endsWith(`.${x}`)))throw new Error("host_not_allowed"); return u.toString(); }
async function browser(){ if(!context)context=await chromium.launchPersistentContext(PROFILE,{headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]}); return context; }
async function page(){ const c=await browser(); return c.pages()[0]||await c.newPage(); }
function digest(s){return crypto.createHash("sha256").update(s).digest("hex");}
function clean(text){return String(text||"").replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,"Bearer [REDACTED]").replace(/\b(?:sk|sess)-[A-Za-z0-9_-]{12,}\b/g,"[REDACTED]").slice(0,50000);}

app.get("/health",guard,async(_req,res)=>{try{const p=await page();res.json({ok:true,runtime:"railway-playwright",session_attached:true,current_url:p.url(),allowed_hosts:[...ALLOWED]});}catch(e){res.status(503).json({ok:false,error:String(e?.message||e)});}});
app.post("/navigate",guard,async(req,res)=>{try{const url=allowedUrl(String(req.body?.url||""));const p=await page();await p.goto(url,{waitUntil:"domcontentloaded",timeout:30000});res.json({ok:true,final_url:p.url(),title:await p.title()});}catch(e){res.status(400).json({ok:false,error:String(e?.message||e)});}});
app.post("/observe",guard,async(req,res)=>{try{const url=allowedUrl(String(req.body?.url||""));const p=await page();await p.goto(url,{waitUntil:"domcontentloaded",timeout:30000});const title=await p.title();const text=clean(await p.locator("body").innerText({timeout:10000}));const stable=JSON.stringify({final_url:p.url(),title,text});res.json({ok:true,final_url:p.url(),title,text,snapshot_digest:digest(stable)});}catch(e){res.status(400).json({ok:false,error:String(e?.message||e)});}});

app.listen(PORT,"0.0.0.0",()=>console.log(`browser runtime listening ${PORT}`));
