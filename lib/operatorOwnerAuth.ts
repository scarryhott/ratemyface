import { NextRequest } from "next/server";

export type OperatorOwnerIdentity = {
  id: string;
  method: "google" | "phone" | "ethereum" | "solana" | "unknown";
  email?: string;
  phone?: string;
  wallet?: string;
};

function supabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
}

function supabaseKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/[^+\d]/g, "");
}

function normalizeWallet(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function walletCandidates(user: any): string[] {
  const values: unknown[] = [
    user?.user_metadata?.address,
    user?.user_metadata?.wallet_address,
    user?.app_metadata?.address,
    user?.app_metadata?.wallet_address
  ];
  for (const identity of Array.isArray(user?.identities) ? user.identities : []) {
    values.push(
      identity?.identity_data?.address,
      identity?.identity_data?.wallet_address,
      identity?.identity_data?.sub,
      identity?.id
    );
  }
  return [...new Set(values.map(normalizeWallet).filter(Boolean))];
}

export function configuredOwnerIdentifiers() {
  return {
    email: normalizeEmail(process.env.RMF_OPERATOR_OWNER_EMAIL),
    phone: normalizePhone(process.env.RMF_OPERATOR_OWNER_PHONE),
    ethereum: normalizeWallet(process.env.RMF_OPERATOR_OWNER_ETH_ADDRESS),
    solana: normalizeWallet(process.env.RMF_OPERATOR_OWNER_SOL_ADDRESS)
  };
}

export function identifyConfiguredOwner(user: any): OperatorOwnerIdentity | null {
  if (!user?.id) return null;
  const allowed = configuredOwnerIdentifiers();
  const email = normalizeEmail(user.email);
  const phone = normalizePhone(user.phone);
  const wallets = walletCandidates(user);

  if (allowed.email && email === allowed.email) {
    return { id: String(user.id), method: "google", email };
  }
  if (allowed.phone && phone === allowed.phone) {
    return { id: String(user.id), method: "phone", phone };
  }
  if (allowed.ethereum && wallets.includes(allowed.ethereum)) {
    return { id: String(user.id), method: "ethereum", wallet: allowed.ethereum };
  }
  if (allowed.solana && wallets.includes(allowed.solana)) {
    return { id: String(user.id), method: "solana", wallet: allowed.solana };
  }
  return null;
}

export async function userForSupabaseAccessToken(token: string): Promise<any | null> {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key || !token) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: key },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export async function operatorOwnerFromRequest(request: NextRequest): Promise<OperatorOwnerIdentity | null> {
  const token = request.cookies.get("rmf_owner_access")?.value || "";
  if (!token) return null;
  const user = await userForSupabaseAccessToken(token);
  return identifyConfiguredOwner(user);
}

export async function operatorRequestAuthorized(
  request: NextRequest,
  options: { allowSignalSecret?: boolean; allowCron?: boolean } = {}
): Promise<{ ok: boolean; actor?: string; owner?: OperatorOwnerIdentity }> {
  const auth = request.headers.get("authorization") || "";
  if (options.allowSignalSecret !== false) {
    const secret = process.env.RMF_OPERATOR_SIGNAL_SECRET;
    if (secret && auth === `Bearer ${secret}`) return { ok: true, actor: "operator-signal-secret" };
  }
  if (options.allowCron) {
    const cron = process.env.CRON_SECRET;
    if (cron && auth === `Bearer ${cron}`) return { ok: true, actor: "vercel-cron" };
  }
  const owner = await operatorOwnerFromRequest(request);
  if (owner) return { ok: true, actor: `owner:${owner.method}`, owner };
  return { ok: false };
}
