import { NextRequest, NextResponse } from "next/server";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

const targets = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    login_url: "https://chatgpt.com/auth/login",
    auth_method: "Continue with Google",
    mode: "owner_interactive",
    note: "OpenAI requires the account's own supported sign-in flow. This launcher does not export or copy the ChatGPT browser session to the operator."
  },
  {
    id: "github",
    name: "GitHub",
    login_url: "https://github.com/login",
    auth_method: "provider sign-in",
    mode: "owner_interactive",
    note: "Use a provider OAuth/App or fine-grained token for durable operator API access rather than sharing a browser password."
  },
  {
    id: "vercel",
    name: "Vercel",
    login_url: "https://vercel.com/login",
    auth_method: "provider sign-in",
    mode: "owner_interactive",
    note: "Interactive sign-in is separate from durable API authorization for the operator."
  },
  {
    id: "stripe",
    name: "Stripe",
    login_url: "https://dashboard.stripe.com/login",
    auth_method: "provider sign-in",
    mode: "owner_interactive",
    note: "Do not place Stripe passwords or secret keys in the browser launcher, repository, or model context."
  },
  {
    id: "supabase",
    name: "Supabase",
    login_url: "https://supabase.com/dashboard/sign-in",
    auth_method: "provider sign-in",
    mode: "owner_interactive",
    note: "Use project-scoped service/API credentials for durable automation instead of reusing a dashboard session."
  }
] as const;

export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request, { allowSignalSecret: false, allowCron: false });
  if (!auth.ok || !auth.owner) {
    return NextResponse.json({ ok: false, error: "owner_auth_required" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    actor: auth.actor,
    owner: auth.owner,
    targets,
    invariant: "Interactive sign-in proves owner control of the browser session; durable operator access must use each provider's supported OAuth/API grant."
  });
}
