import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

function safeDbMeta() {
  const source = process.env.POSTGRES_URL ? "POSTGRES_URL" : process.env.DATABASE_URL ? "DATABASE_URL" : "none";
  const raw = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
  if (!raw) return { source, configured: false, host_suffix: null, port: null };
  try {
    const url = new URL(raw.replace(/^postgres(?:ql)?:\/\//, "http://"));
    const host = url.hostname;
    const parts = host.split(".");
    const hostSuffix = parts.length >= 3 ? parts.slice(-3).join(".") : host;
    return { source, configured: true, host_suffix: hostSuffix, port: url.port || "5432" };
  } catch {
    return { source, configured: true, host_suffix: "unparseable", port: null };
  }
}

export async function GET(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const meta = safeDbMeta();
  if (!meta.configured) return NextResponse.json({ ok: false, stage: "config", ...meta }, { status: 500 });

  const raw = process.env.POSTGRES_URL || process.env.DATABASE_URL!;
  const started = Date.now();
  const sql = postgres(raw, {
    max: 1,
    ssl: "require",
    prepare: false,
    connect_timeout: 3,
    idle_timeout: 3,
    max_lifetime: 10
  });

  try {
    const rows = await Promise.race([
      sql`select 1::int as ok`,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("probe_timeout_5000ms")), 5000))
    ]);
    return NextResponse.json({
      ok: true,
      stage: "query",
      ...meta,
      latency_ms: Date.now() - started,
      result: Number(rows[0]?.ok || 0)
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: "query",
      ...meta,
      latency_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}
