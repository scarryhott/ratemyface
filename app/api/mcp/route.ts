import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  askMyHistory,
  getProductLearning,
  getSocialOutcomeIntelligence,
  personalIntelligenceTablesReady,
  readPersonalAgentRuns,
  readReferenceComparisons
} from "../../../lib/personalIntelligence";
import {
  PERSONAL_INTELLIGENCE_ACTION_TIMEOUT_MS,
  databaseConfigured,
  withDatabaseTimeout
} from "../../../lib/db";

export const runtime="nodejs"; export const maxDuration=60;
const ORIGIN=process.env.RMF_PUBLIC_ORIGIN||"https://ratemyface.vercel.app";
async function control(action:string,url?:string){const secret=process.env.RMF_BROWSER_AGENT_SECRET||"";if(!secret)throw new Error("RMF_BROWSER_AGENT_SECRET_not_configured");const r=await fetch(`${ORIGIN}/api/operator/browser-control`,{method:"POST",headers:{"content-type":"application/json","x-rmf-browser-agent":secret},body:JSON.stringify({action,...(url?{url}:{})}),cache:"no-store"});const text=await r.text();if(!r.ok)throw new Error(`browser_control_${r.status}:${text.slice(0,1000)}`);try{return JSON.parse(text)}catch{return{raw:text}}}
const out=(x:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(x)}],structuredContent:x as Record<string,unknown>});
function personalMcpUserId(){if(!(process.env.RMF_CHATGPT_MCP_TOKEN||"").trim())throw new Error("RMF_CHATGPT_MCP_TOKEN_not_configured");const userId=(process.env.RMF_CHATGPT_MCP_USER_ID||"").trim();if(!userId)throw new Error("RMF_CHATGPT_MCP_USER_ID_not_configured");return userId}
async function personalRead<T>(read:(userId:string)=>Promise<T>){if(!databaseConfigured())throw new Error("database_not_configured");return withDatabaseTimeout(async()=>{if(!(await personalIntelligenceTablesReady()))throw new Error("personal_intelligence_schema_missing");return read(personalMcpUserId())},PERSONAL_INTELLIGENCE_ACTION_TIMEOUT_MS)}
const mcpHandler=createMcpHandler(server=>{
 const ro={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true};
 const personalRo={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
 server.registerTool("browser_health",{title:"Persistent Browser Health",description:"Check the Vercel-to-Railway persistent browser runtime.",inputSchema:{},annotations:ro},async()=>out(await control("status")));
 server.registerTool("chatgpt_observe_closure",{title:"ChatGPT Observe Closure",description:"Observe an allowlisted ChatGPT HTTPS page through Railway Chromium, independently reread it, compare snapshot digests, and halt without account mutation.",inputSchema:{url:z.string().url().optional()},annotations:ro},async({url})=>{const target=url||"https://chatgpt.com/";const observation=await control("observe",target);const receipt=await control("receipt");return out({ok:Boolean(observation?.ok&&receipt?.ok&&receipt?.digest_match),target,observation,receipt,closure:{digest_match:Boolean(receipt?.digest_match),halted:Boolean(receipt?.halted)}})});
 server.registerTool("browser_session",{title:"Browser Session State",description:"Check persistent site state for an allowed HTTPS URL.",inputSchema:{url:z.string().url()},annotations:ro},async({url})=>out(await control("session",url)));
 server.registerTool("browser_observe",{title:"Observe Browser Page",description:"Navigate to an allowed HTTPS URL and return its current URL, title, text snapshot and digest.",inputSchema:{url:z.string().url()},annotations:ro},async({url})=>out(await control("observe",url)));
 server.registerTool("browser_receipt",{title:"Browser Verification Receipt",description:"Independently reread the browser page and return a digest-match receipt.",inputSchema:{url:z.string().url().optional()},annotations:ro},async({url})=>out(await control("receipt",url)));
 server.registerTool("browser_navigate",{title:"Navigate Browser",description:"Navigate the persistent Railway browser to an allowed HTTPS URL.",inputSchema:{url:z.string().url()},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}},async({url})=>out(await control("navigate",url)));
 server.registerTool("browser_owner_start",{title:"Start Interactive Browser",description:"Start a short-lived interactive viewer for the persistent Railway browser.",inputSchema:{url:z.string().url().optional()},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}},async({url})=>out(await control("ownerStart",url)));
 server.registerTool("browser_owner_status",{title:"Interactive Browser Status",description:"Check whether the temporary interactive viewer is active.",inputSchema:{},annotations:ro},async()=>out(await control("ownerStatus")));
 server.registerTool("browser_owner_finish",{title:"Finish Interactive Browser",description:"Finish the temporary viewer while retaining the persistent profile.",inputSchema:{},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async()=>out(await control("ownerFinish")));
 server.registerTool("personal_ask_history",{title:"Ask Personal History",description:"Read a bounded answer from the single server-scoped user's own stored evidence. Returns explicit insufficient when no record matches.",inputSchema:{question:z.string().min(1).max(500),limit:z.number().int().min(1).max(12).optional()},annotations:personalRo},async({question,limit})=>out(await personalRead(userId=>askMyHistory(userId,question,limit||8))));
 server.registerTool("personal_product_learning",{title:"Read Product Outcome Learning",description:"Read per-product personal outcome closure without making causal, population, or medical claims.",inputSchema:{},annotations:personalRo},async()=>out(await personalRead(userId=>getProductLearning(userId))));
 server.registerTool("personal_social_outcomes",{title:"Read Social Outcome Intelligence",description:"Read user-recorded or provider-authorized social metric trends. Never scrapes provider data.",inputSchema:{},annotations:personalRo},async()=>out(await personalRead(userId=>getSocialOutcomeIntelligence(userId))));
 server.registerTool("personal_reference_comparisons",{title:"Read Reference Comparisons",description:"Read distinct chosen reference comparisons with explicit insufficient, tied, or directional evidence states.",inputSchema:{comparison_id:z.number().int().positive().optional(),limit:z.number().int().min(1).max(50).optional()},annotations:personalRo},async({comparison_id,limit})=>out(await personalRead(userId=>readReferenceComparisons(userId,{comparison_id,limit}))));
 server.registerTool("personal_agent_status",{title:"Read Personal Agent Receipts",description:"Read bounded personal-agent runs, approval states, and verification receipts. This MCP surface cannot approve or execute writes.",inputSchema:{run_id:z.number().int().positive().optional(),limit:z.number().int().min(1).max(50).optional()},annotations:personalRo},async({run_id,limit})=>out(await personalRead(userId=>readPersonalAgentRuns(userId,{run_id,limit}))));
},{},{basePath:"/api",maxDuration:60,verboseLogs:false});
function authorized(request:Request){const expected=process.env.RMF_CHATGPT_MCP_TOKEN||"";if(!expected)return true;return request.headers.get("authorization")===`Bearer ${expected}`}
async function guarded(request:Request){if(!authorized(request))return new Response(JSON.stringify({error:"unauthorized"}),{status:401,headers:{"content-type":"application/json"}});return mcpHandler(request)}
export {guarded as GET,guarded as POST,guarded as DELETE};
