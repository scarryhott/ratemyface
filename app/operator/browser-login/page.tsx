"use client";

import { useEffect, useState } from "react";

export default function BrowserLoginPage(){
  const [session,setSession]=useState<any>(null);const [status,setStatus]=useState<any>(null);const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  async function request(method:"GET"|"POST"|"DELETE"){setLoading(true);setError("");try{const r=await fetch("/api/operator/browser-session",{method,credentials:"same-origin",cache:"no-store"});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(b?.error||`HTTP_${r.status}`));if(method==="POST")setSession(b);else setStatus(b);if(method==="DELETE")setSession(null);return b;}catch(e:any){setError(String(e?.message||e));}finally{setLoading(false);}}
  useEffect(()=>{void request("GET");},[]);
  return <main><h1>Temporary Browser Login</h1><p>This opens the persistent Railway Chromium profile for 15 minutes so you can authenticate ChatGPT directly. Credentials are typed only inside the remote browser and are not returned to the operator.</p>
    <div className="card"><p><strong>Session:</strong> {status?.active||session?"active":"inactive"}</p>{session?.expires_at&&<p><strong>Expires:</strong> {session.expires_at}</p>}
      {!session?<button disabled={loading} onClick={()=>request("POST")} style={button}>Open 15-minute login session</button>:<><p><strong>VNC password:</strong> <code>{session.vnc_password}</code></p><p>Open the viewer, enter the VNC password if prompted, then use ChatGPT's normal <strong>Continue with Google</strong> flow inside that browser.</p><a href={session.viewer_url} target="_blank" rel="noreferrer" style={link}>Open remote Chromium</a><button disabled={loading} onClick={()=>request("DELETE")} style={secondary}>Finish browser login</button></>}
    </div>{error&&<div className="card"><strong>Error:</strong> {error}</div>}<p><a href="/operator">Back to Builder Operator</a></p></main>;
}
const button:React.CSSProperties={padding:"10px 14px",border:"1px solid #111",borderRadius:8,background:"#111",color:"white",cursor:"pointer"};
const secondary:React.CSSProperties={...button,background:"white",color:"#111",marginLeft:8};
const link:React.CSSProperties={...button,display:"inline-block",textDecoration:"none",marginRight:8};
