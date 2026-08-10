import express from "express";
import { chromium } from "playwright";
import crypto from "node:crypto";
import http from "node:http";
import httpProxy from "http-proxy";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";

const app=express(); app.use(express.json({limit:"64kb"}));
const server=http.createServer(app);
const proxy=httpProxy.createProxyServer({target:"http://127.0.0.1:6080",ws:true});
const PORT=Number(process.env.PORT||8080);
const TOKEN=process.env.RMF_BROWSER_CONTROL_TOKEN||"";
const PROFILE=process.env.RMF_BROWSER_PROFILE_DIR||"/data/browser-profile";
const ALLOWED=new Set((process.env.RMF_BROWSER_ALLOWED_HOSTS||"chatgpt.com").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));
let context=null;
let ownerSession=null;
let vncProcess=null;
let websockifyProcess=null;
let expiryTimer=null;

function authorized(req){ if(!TOKEN)return false; const h=req.headers.authorization||""; const a=Buffer.from(h); const b=Buffer.from(`Bearer ${TOKEN}`); return a.length===b.length&&crypto.timingSafeEqual(a,b); }
function guard(req,res,next){ if(!authorized(req))return res.status(401).json({ok:false,error:"unauthorized"}); next(); }
function allowedUrl(raw){ const u=new URL(raw); if(u.protocol!=="https:")throw new Error("https_required"); const host=u.hostname.toLowerCase(); if(![...ALLOWED].some(x=>host===x||host.endsWith(`.${x}`)))throw new Error("host_not_allowed"); return u.toString(); }
async function browser(){ if(!context)context=await chromium.launchPersistentContext(PROFILE,{headless:false,args:["--no-sandbox","--disable-dev-shm-usage","--window-size=1440,900"]}); return context; }
async function page(){ const c=await browser(); return c.pages()[0]||await c.newPage(); }
function digest(s){return crypto.createHash("sha256").update(s).digest("hex");}
function clean(text){return String(text||"").replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,"Bearer [REDACTED]").replace(/\b(?:sk|sess)-[A-Za-z0-9_-]{12,}\b/g,"[REDACTED]").slice(0,50000);}
function stopProc(proc){try{if(proc&&!proc.killed)proc.kill("SIGTERM");}catch{}}
function endOwnerSession(){if(expiryTimer){clearTimeout(expiryTimer);expiryTimer=null;}stopProc(websockifyProcess);stopProc(vncProcess);websockifyProcess=null;vncProcess=null;try{fs.unlinkSync("/tmp/rmf-vnc.pass");}catch{} ownerSession=null;}
async function startOwnerSession(){
  endOwnerSession();
  const p=await page();
  try{await p.goto("https://chatgpt.com/",{waitUntil:"domcontentloaded",timeout:30000});}catch{}
  const password=crypto.randomBytes(6).toString("base64url").slice(0,8);
  execFileSync("x11vnc",["-storepasswd",password,"/tmp/rmf-vnc.pass"],{stdio:"ignore"});
  vncProcess=spawn("x11vnc",["-display",process.env.DISPLAY||":99","-rfbauth","/tmp/rmf-vnc.pass","-rfbport","5900","-localhost","-forever","-shared","-noxdamage"],{stdio:"ignore"});
  websockifyProcess=spawn("websockify",["--web=/usr/share/novnc","6080","127.0.0.1:5900"],{stdio:"ignore"});
  const sessionToken=crypto.randomBytes(24).toString("base64url");
  const expiresAt=Date.now()+15*60*1000;
  ownerSession={sessionToken,password,expiresAt};
  expiryTimer=setTimeout(endOwnerSession,15*60*1000);
  return {session_token:sessionToken,vnc_password:password,expires_at:new Date(expiresAt).toISOString(),viewer_path:`/owner-browser/vnc.html?autoconnect=true&resize=scale&path=owner-browser/websockify&token=${encodeURIComponent(sessionToken)}`};
}
function ownerViewerAllowed(req){if(!ownerSession||Date.now()>ownerSession.expiresAt)return false;const u=new URL(req.url,"http://localhost");return u.searchParams.get("token")===ownerSession.sessionToken||req.headers.referer?.includes(`token=${ownerSession.sessionToken}`);}

app.get("/health",guard,async(_req,res)=>{try{const p=await page();res.json({ok:true,runtime:"railway-playwright",session_attached:true,current_url:p.url(),allowed_hosts:[...ALLOWED],interactive_login_active:Boolean(ownerSession)});}catch(e){res.status(503).json({ok:false,error:String(e?.message||e)});}});
app.post("/navigate",guard,async(req,res)=>{try{const url=allowedUrl(String(req.body?.url||""));const p=await page();await p.goto(url,{waitUntil:"domcontentloaded",timeout:30000});res.json({ok:true,final_url:p.url(),title:await p.title()});}catch(e){res.status(400).json({ok:false,error:String(e?.message||e)});}});
app.post("/observe",guard,async(req,res)=>{try{const url=allowedUrl(String(req.body?.url||""));const p=await page();await p.goto(url,{waitUntil:"domcontentloaded",timeout:30000});const title=await p.title();const text=clean(await p.locator("body").innerText({timeout:10000}));const stable=JSON.stringify({final_url:p.url(),title,text});res.json({ok:true,final_url:p.url(),title,text,snapshot_digest:digest(stable)});}catch(e){res.status(400).json({ok:false,error:String(e?.message||e)});}});
app.post("/owner-session/start",guard,async(_req,res)=>{try{res.json({ok:true,...await startOwnerSession()});}catch(e){endOwnerSession();res.status(500).json({ok:false,error:String(e?.message||e)});}});
app.get("/owner-session/status",guard,(_req,res)=>res.json({ok:true,active:Boolean(ownerSession),expires_at:ownerSession?new Date(ownerSession.expiresAt).toISOString():null}));
app.post("/owner-session/finish",guard,(_req,res)=>{endOwnerSession();res.json({ok:true,finished:true});});
app.use("/owner-browser",(req,res)=>{if(!ownerViewerAllowed(req))return res.status(401).send("Temporary browser login session is not active or token is invalid.");req.url=req.url.replace(/^\/owner-browser/,"")||"/";proxy.web(req,res);});
server.on("upgrade",(req,socket,head)=>{if(!req.url?.startsWith("/owner-browser/")){socket.destroy();return;}if(!ownerViewerAllowed(req)){socket.destroy();return;}req.url=req.url.replace(/^\/owner-browser/,"")||"/";proxy.ws(req,socket,head);});

server.listen(PORT,"0.0.0.0",()=>console.log(`browser runtime listening ${PORT}`));
