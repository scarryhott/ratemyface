import { NextRequest, NextResponse } from "next/server";
import { databaseConfigured, db, ensureMemorySchema } from "../../../../lib/db";
import { currentOAuthUser } from "../../../../lib/supabaseAuth";

async function requireUser(request: NextRequest) {
  const user = await currentOAuthUser(request);
  if (!user) return null;
  return user;
}

export async function POST(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const consent = body.consent_personalization === true;
  const context = body.context && typeof body.context === "object" ? body.context : {};
  if (!consent) return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });

  await ensureMemorySchema();
  const sql = db();
  await sql`
    insert into rmf_users (id, consent_personalization, updated_at)
    values (${user.id}, true, now())
    on conflict (id) do update set consent_personalization = true, updated_at = now()
  `;
  await sql`
    insert into rmf_user_context (user_id, context, updated_at)
    values (${user.id}, ${sql.json(context)}, now())
    on conflict (user_id) do update set context = excluded.context, updated_at = now()
  `;
  return NextResponse.json({ ok: true, user_id: user.id });
}

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });

  await ensureMemorySchema();
  const sql = db();
  const rows = await sql`
    select u.consent_personalization, u.consent_history, c.context, c.updated_at
    from rmf_users u
    left join rmf_user_context c on c.user_id = u.id
    where u.id = ${user.id}
    limit 1
  `;
  if (!rows.length) return NextResponse.json({ ok: true, found: false, context: null });
  return NextResponse.json({ ok: true, found: true, ...rows[0] });
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ ok: false, error: "oauth_required" }, { status: 401 });
  if (!databaseConfigured()) return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });

  await ensureMemorySchema();
  const sql = db();
  await sql`delete from rmf_users where id = ${user.id}`;
  return NextResponse.json({ ok: true, deleted: true });
}
