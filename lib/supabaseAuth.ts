import { NextRequest } from "next/server";

export type AuthenticatedUser = {
  id: string;
  email?: string;
};

function supabaseUrl(): string | null {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
}

export function supabaseOAuthConfigured(): boolean {
  return Boolean(supabaseUrl());
}

export async function currentOAuthUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1];
  const url = supabaseUrl();
  if (!url) return null;

  // During migration, never mistake the legacy shared action key for a user OAuth token.
  if (process.env.GPT_ACTION_SECRET && token === process.env.GPT_ACTION_SECRET) return null;

  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) return null;

  const data = await response.json().catch(() => ({}));
  const id = typeof data?.sub === "string" ? data.sub : "";
  if (!id) return null;
  return { id, email: typeof data?.email === "string" ? data.email : undefined };
}

export function legacyActionAuthorized(request: NextRequest): boolean {
  const expected = process.env.GPT_ACTION_SECRET;
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

export async function actionOrOAuthAuthorized(request: NextRequest): Promise<boolean> {
  if (legacyActionAuthorized(request)) return true;
  return Boolean(await currentOAuthUser(request));
}
