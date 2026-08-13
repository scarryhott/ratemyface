import { NextRequest, NextResponse } from "next/server";
import {
  databaseConfigured,
  isDatabaseTimeoutError,
  PROVIDER_OAUTH_TIMEOUT_MS,
  withDatabaseTimeout
} from "../../../../../lib/db";
import { upsertConnectedProvider } from "../../../../../lib/providerConnectionsDb";
import {
  exchangeTikTokAuthorizationCode,
  parseTikTokOAuthState,
  tiktokOAuthConfigured,
  tiktokOAuthSafeError
} from "../../../../../lib/tiktokOAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

async function callbackParams(req: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    out[key] = value;
  });
  if (req.method !== "POST") return out;
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = asRecord(await req.json().catch(() => ({})));
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" && out[key] == null) out[key] = value;
    }
    return out;
  }
  const form = await req.formData().catch(() => null);
  if (!form) return out;
  form.forEach((value, key) => {
    if (typeof value === "string" && out[key] == null) out[key] = value;
  });
  return out;
}

function resultRedirect(
  req: NextRequest,
  status: "ok" | "error",
  error?: string
): NextResponse {
  const url = new URL("/providers/connected", req.nextUrl.origin);
  url.searchParams.set("provider", "tiktok");
  url.searchParams.set("status", status);
  if (error) url.searchParams.set("error", tiktokOAuthSafeError(error));
  return NextResponse.redirect(url);
}

async function handleCallback(req: NextRequest): Promise<NextResponse> {
  if (!tiktokOAuthConfigured()) {
    return resultRedirect(req, "error", "not_configured");
  }

  const params = await callbackParams(req);
  const denied = pickString(params, "error");
  if (denied) {
    return resultRedirect(req, "error", denied === "access_denied" ? "access_denied" : "oauth_error");
  }

  const code = pickString(params, "code").trim();
  const state = pickString(params, "state").trim();
  if (!code || !state) {
    return resultRedirect(req, "error", "missing_code_or_state");
  }

  let parsed: { userId: string } | null;
  try {
    parsed = parseTikTokOAuthState(state);
  } catch {
    return resultRedirect(req, "error", "invalid_state");
  }
  if (!parsed) {
    return resultRedirect(req, "error", "invalid_state");
  }

  if (!databaseConfigured()) {
    return resultRedirect(req, "error", "database_not_configured");
  }

  const exchanged = await exchangeTikTokAuthorizationCode(code);
  if (!exchanged.ok) {
    return resultRedirect(req, "error", exchanged.error);
  }

  try {
    await withDatabaseTimeout(
      () =>
        upsertConnectedProvider({
          userId: parsed.userId,
          provider: "tiktok",
          tokenRef: exchanged.token_ref,
          tokenExpiresAt: exchanged.token_expires_at,
          externalSubject: exchanged.external_subject || null,
          scopes: exchanged.scopes
        }),
      PROVIDER_OAUTH_TIMEOUT_MS
    );
  } catch (error) {
    if (isDatabaseTimeoutError(error)) {
      return resultRedirect(req, "error", "database_timeout");
    }
    return resultRedirect(req, "error", "persist_failed");
  }

  return resultRedirect(req, "ok");
}

export async function GET(req: NextRequest) {
  return handleCallback(req);
}

export async function POST(req: NextRequest) {
  return handleCallback(req);
}
