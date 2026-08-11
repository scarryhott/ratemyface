import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { operatorOwnerFromRequest } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

function secret(): string {
  return process.env.RMF_BROWSER_GRANT_SECRET || "";
}
function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}
function sign(body: string, key: string): string {
  return crypto.createHmac("sha256", key).update(body).digest("base64url");
}

export async function POST(request: NextRequest) {
  const owner = await operatorOwnerFromRequest(request);
  if (!owner) return NextResponse.json({ ok:false, error:"not_authenticated_or_not_authorized" }, { status:401 });
  const key = secret();
  if (!key) return NextResponse.json({ ok:false, error:"browser_grant_not_configured" }, { status:503 });

  const now = Math.floor(Date.now()/1000);
  const payload = {
    sub: owner.id,
    actor: `owner:${owner.method}`,
    aud: "rmf-browser-runtime",
    scope: ["browser:state","browser:navigate","browser:observe","browser:receipt","browser:owner-session"],
    iat: now,
    exp: now + 300,
    jti: crypto.randomUUID()
  };
  const body = b64url(JSON.stringify(payload));
  const grant = `${body}.${sign(body,key)}`;
  return NextResponse.json({ ok:true, grant, expires_at:new Date(payload.exp*1000).toISOString(), scope:payload.scope }, { headers:{"Cache-Control":"no-store"} });
}
