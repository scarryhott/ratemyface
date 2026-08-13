/**
 * TikTok Login Kit user-authorized OAuth (web).
 * Never scrape. Never log raw tokens, codes, or client_secret.
 *
 * This module is self-contained so node:test can import it without
 * extensionless ESM hops.
 */
import crypto from "crypto";

export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_SCOPES = "user.info.basic";
export const TIKTOK_TOKEN_TIMEOUT_MS = 8_000;
const STATE_TTL_SECONDS = 10 * 60;
const TOKEN_REF_PREFIX = "v1";
const KEY_INFO = "rmf-provider-token-v1:";

export type ProviderTokenMaterial = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

function tokenRefKey(): Buffer {
  const secret =
    process.env.RMF_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.TIKTOK_OAUTH_CLIENT_SECRET?.trim() ||
    process.env.RMF_OAUTH_CLIENT_SECRET?.trim() ||
    "";
  if (!secret) {
    throw new Error("token_ref_key_missing");
  }
  return crypto.createHash("sha256").update(KEY_INFO).update(secret).digest();
}

export function encryptTokenRef(material: ProviderTokenMaterial): string {
  const key = tokenRefKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const packed = Buffer.from(
    JSON.stringify({
      a: material.access_token,
      r: material.refresh_token || "",
      t: material.token_type || "Bearer"
    }),
    "utf8"
  );
  const ciphertext = Buffer.concat([cipher.update(packed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_REF_PREFIX}.${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

export function decryptTokenRef(tokenRef: string): ProviderTokenMaterial {
  const key = tokenRefKey();
  const [prefix, payload] = String(tokenRef || "").split(".");
  if (prefix !== TOKEN_REF_PREFIX || !payload) {
    throw new Error("token_ref_invalid");
  }
  const raw = Buffer.from(payload, "base64url");
  if (raw.length < 29) {
    throw new Error("token_ref_invalid");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const packed = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(packed) as { a?: string; r?: string; t?: string };
  return {
    access_token: String(parsed.a || ""),
    refresh_token: String(parsed.r || ""),
    token_type: String(parsed.t || "Bearer")
  };
}

const SECRET_KEY_RE = /^(access_token|refresh_token|token|code|client_secret|code_verifier)$/i;

/** Strip token-like fields before any diagnostic object is logged. */
export function redactProviderSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProviderSecrets);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = redactProviderSecrets(val);
  }
  return out;
}

export function tiktokClientKey(): string {
  return (process.env.TIKTOK_OAUTH_CLIENT_KEY || "").trim();
}

export function tiktokClientSecret(): string {
  return (process.env.TIKTOK_OAUTH_CLIENT_SECRET || "").trim();
}

export function tiktokOAuthConfigured(): boolean {
  return Boolean(tiktokClientKey() && tiktokClientSecret());
}

/** Production callback Harry registered / intended on the TikTok app. */
export function tiktokOAuthRedirectUri(): string {
  const explicit = (process.env.TIKTOK_OAUTH_REDIRECT_URI || "").trim();
  if (explicit) return explicit;
  const host = (
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    "ratemyface.vercel.app"
  )
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return `https://${host}/api/providers/tiktok/callback`;
}

type SignedStatePayload = {
  p: "tiktok";
  u: string;
  e: number;
  n: string;
};

function stateHmacKey(): Buffer {
  const secret = tiktokClientSecret() || process.env.RMF_OAUTH_CLIENT_SECRET?.trim() || "";
  if (!secret) throw new Error("tiktok_state_key_missing");
  return crypto.createHash("sha256").update("rmf-tiktok-oauth-state-v1:").update(secret).digest();
}

export function createTikTokOAuthState(userId: string): string {
  const payload: SignedStatePayload = {
    p: "tiktok",
    u: userId,
    e: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    n: crypto.randomBytes(12).toString("base64url")
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = crypto.createHmac("sha256", stateHmacKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function parseTikTokOAuthState(state: string): { userId: string } | null {
  try {
    const raw = String(state || "").trim();
    const dot = raw.lastIndexOf(".");
    if (dot <= 0) return null;
    const body = raw.slice(0, dot);
    const mac = raw.slice(dot + 1);
    const expected = crypto.createHmac("sha256", stateHmacKey()).update(body).digest("base64url");
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedStatePayload;
    if (payload.p !== "tiktok" || typeof payload.u !== "string" || !payload.u) return null;
    if (typeof payload.e !== "number" || payload.e < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.u };
  } catch {
    return null;
  }
}

export function tiktokAuthorizeUrl(userId: string): {
  authorize_url: string;
  redirect_uri: string;
  state: string;
  scopes: string;
} {
  const redirect_uri = tiktokOAuthRedirectUri();
  const state = createTikTokOAuthState(userId);
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set("client_key", tiktokClientKey());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TIKTOK_SCOPES);
  url.searchParams.set("redirect_uri", redirect_uri);
  url.searchParams.set("state", state);
  return {
    authorize_url: url.toString(),
    redirect_uri,
    state,
    scopes: TIKTOK_SCOPES
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function tiktokErrorCode(body: Record<string, unknown>): string {
  const err = body.error;
  if (typeof err === "string" && err.trim() && err.length < 80) return err.trim();
  if (err && typeof err === "object") {
    const nested = err as Record<string, unknown>;
    const code = nested.code ?? nested.error;
    if (typeof code === "string" && code.trim() && code.length < 80) return code.trim();
  }
  const desc = body.error_description;
  if (typeof desc === "string" && desc.trim() && desc.length < 80) return "oauth_error";
  return "token_exchange_failed";
}

export type TikTokTokenExchangeResult =
  | {
      ok: true;
      token_ref: string;
      token_expires_at: Date;
      external_subject: string;
      scopes: string[];
    }
  | { ok: false; error: string };

/**
 * Exchange an authorization code for tokens, then encrypt immediately.
 * The raw token payload is not returned and must not be logged.
 */
function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export async function exchangeTikTokAuthorizationCode(
  code: string
): Promise<TikTokTokenExchangeResult> {
  const clientKey = tiktokClientKey();
  const clientSecret = tiktokClientSecret();
  if (!clientKey || !clientSecret) {
    return { ok: false, error: "not_configured" };
  }
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "missing_code" };

  let response: Response;
  try {
    response = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: trimmed,
        grant_type: "authorization_code",
        redirect_uri: tiktokOAuthRedirectUri()
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIKTOK_TOKEN_TIMEOUT_MS)
    });
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || /timeout/i.test(error.message));
    return { ok: false, error: timedOut ? "tiktok_timeout" : "tiktok_unreachable" };
  }

  const json = asRecord(await response.json().catch(() => ({})));
  const nested = asRecord(json.data);
  const access = firstString(json.access_token, nested.access_token);
  if (!access) {
    return { ok: false, error: tiktokErrorCode(json) };
  }

  const refresh = firstString(json.refresh_token, nested.refresh_token);
  const tokenType = firstString(json.token_type, nested.token_type) || "Bearer";
  const openId = firstString(json.open_id, nested.open_id);
  const expiresIn = Number(json.expires_in ?? nested.expires_in);
  const scopeRaw = firstString(json.scope, nested.scope) || TIKTOK_SCOPES;
  const token_ref = encryptTokenRef({
    access_token: access,
    refresh_token: refresh,
    token_type: tokenType
  });
  const scopes = scopeRaw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ok: true,
    token_ref,
    token_expires_at: new Date(
      Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 86400) * 1000
    ),
    external_subject: openId,
    scopes
  };
}

export function tiktokOAuthSafeError(error: string): string {
  if (!error) return "oauth_error";
  return error.replace(/act\.|rft\.|access_token|refresh_token/gi, "[redacted]").slice(0, 80);
}
