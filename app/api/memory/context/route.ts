import { NextRequest, NextResponse } from "next/server";
import { actionAuthorized } from "../../../../lib/actionAuth";
import { databaseConfigured, db, ensureMemorySchema } from "../../../../lib/db";

function cleanUserId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 128) : "";
}

export async function POST(request: NextRequest) {
  if (!actionAuthorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const userId = cleanUserId(body.user_id);
  const consent = body.consent_personalization === true;
  const context = body.context && typeof body.context === "object" ? body.context : {};
  if (!userId) return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  if (!consent) return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });

  await ensureMemorySchema();
  const sql = db();
  await sql`
    insert into rmf_users (id, consent_personalization, updated_at)
    values (${userId}, true, now())
    on conflict (id) do update set consent_personalization = true, updated_at = now()
  `;
  await sql`
    insert into rmf_user_context (user_id, context, updated_at)
    values (${userId}, ${sql.json(context)}, now())
    on conflict (user_id) do update set context = excluded.context, updated_at = now()
  `;
  return NextResponse.json({ ok: true, user_id: userId });
}

export async function GET(request: NextRequest) {
  if (!actionAuthorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  const userId = cleanUserId(request.nextUrl.searchParams.get("user_id"));
  if (!userId) return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });

  await ensureMemorySchema();
  const sql = db();
  const rows = await sql`
    select u.consent_personalization, u.consent_history, c.context, c.updated_at
    from rmf_users u
    left join rmf_user_context c on c.user_id = u.id
    where u.id = ${userId}
    limit 1
  `;
  if (!rows.length) return NextResponse.json({ ok: true, found: false, user_id: userId, context: null });
  return NextResponse.json({ ok: true, found: true, user_id: userId, ...rows[0] });
}

export async function DELETE(request: NextRequest) {
  if (!actionAuthorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const userId = cleanUserId(body.user_id);
  if (!userId) return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  await ensureMemorySchema();
  const sql = db();
  await sql`delete from rmf_users where id = ${userId}`;
  return NextResponse.json({ ok: true, deleted: true, user_id: userId });
}
