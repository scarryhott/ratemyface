"use client";

import { useEffect, useState } from "react";

type Target = { id:string; name:string; login_url:string; auth_method:string; mode:string; note:string };

export default function OperatorAccessPage(){
  const [data,setData]=useState<any>(null);
  const [error,setError]=useState("");
  useEffect(()=>{void (async()=>{
    const r=await fetch("/api/operator/access",{cache:"no-store",credentials:"same-origin"});
    const b=await r.json().catch(()=>({}));
    if(!r.ok){setError(String(b?.error||`HTTP_${r.status}`));return;}
    setData(b);
  })();},[]);

  if(error) return <main><h1>Account Access</h1><p>Owner authentication is required.</p><a href="/operator/login">Sign in as owner</a><p>{error}</p></main>;
  if(!data) return <main><h1>Account Access</h1><p>Loading…</p></main>;

  return <main>
    <h1>Account Sign-In Access</h1>
    <p><strong>Owner:</strong> {data.owner?.email||data.owner?.phone||data.owner?.wallet||data.owner?.id}</p>
    <p>This page launches official provider sign-in flows in your browser. It never asks for, stores, or returns account passwords, recovery codes, or browser cookies.</p>
    {data.targets?.map((target:Target)=><div className="card" key={target.id}>
      <h2 style={{marginTop:0}}>{target.name}</h2>
      <p><strong>Method:</strong> {target.auth_method}</p>
      <p>{target.note}</p>
      <a href={target.login_url} target="_blank" rel="noreferrer" style={buttonLinkStyle}>Open {target.name} sign in</a>
    </div>)}
    <div className="card"><h2 style={{marginTop:0}}>Durable operator access</h2><p>{data.invariant}</p><p>After an account is signed in, connect its supported OAuth/API grant separately if you want the operator to act on that service without relying on your browser session.</p></div>
    <a href="/operator">Back to Builder Operator</a>
  </main>;
}

const buttonLinkStyle:React.CSSProperties={display:"inline-block",marginTop:8,padding:"10px 14px",border:"1px solid #111",borderRadius:8,background:"#111",color:"white",textDecoration:"none"};
