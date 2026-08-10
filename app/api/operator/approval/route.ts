import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { ensureOperatorSchema } from "../../../../lib/operatorAgent";
import { operatorRequestAuthorized } from "../../../../lib/operatorOwnerAuth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await operatorRequestAuthorized(request);
  if (!auth.ok) return NextResponse.json({ ok:false, error:"unauthorized" }, { status:401 });

  const body = await request.json().catch(() => ({}));
  const approvalId = Number(body.approval_id);
  const decision = String(body.decision || "").toLowerCase();
  if (!Number.isInteger(approvalId) || approvalId <= 0) return NextResponse.json({ ok:false, error:"invalid_approval_id" }, { status:400 });
  if (decision !== "approve" && decision !== "reject") return NextResponse.json({ ok:false, error:"decision_must_be_approve_or_reject" }, { status:400 });

  await ensureOperatorSchema();
  const sql = db();
  const rows = await sql`
    select a.id as approval_id,a.run_id,a.capability,a.requested_authority,a.status as approval_status,a.rationale,
      r.signal_id,r.status as run_status,s.source,s.kind,s.payload,s.requested_authority as signal_requested_authority
    from rmf_agent_approvals a
    join rmf_agent_runs r on r.id=a.run_id
    join rmf_agent_signals s on s.id=r.signal_id
    where a.id=${approvalId}
    limit 1
  `;
  const item = rows[0];
  if (!item) return NextResponse.json({ ok:false, error:"approval_not_found" }, { status:404 });
  if (String(item.approval_status) !== "pending") return NextResponse.json({ ok:false, error:"approval_already_decided", approval:item }, { status:409 });

  if (decision === "reject") {
    await sql`update rmf_agent_approvals set status='rejected',decided_at=now() where id=${approvalId}`;
    await sql`update rmf_agent_runs set status='rejected',closure_state='rejected',completed_at=now() where id=${item.run_id}`;
    await sql`update rmf_agent_signals set status='rejected',completed_at=now() where id=${item.signal_id}`;
    await sql`insert into rmf_agent_ledger(run_id,event,capability,authority,admissible,detail) values(${item.run_id},'owner_rejected',${item.capability},${item.requested_authority},false,${sql.json({ approval_id:approvalId, actor:auth.actor } as any)})`;
    return NextResponse.json({ ok:true, decision:"rejected", approval_id:approvalId, actor:auth.actor });
  }

  const originalPayload = item.payload && typeof item.payload === "object" ? item.payload : {};
  const approvedPayload = { ...originalPayload, owner_approved:true, owner_approved_authority:Number(item.requested_authority), approval_id:approvalId, approved_from_run:Number(item.run_id), approved_actor:auth.actor };
  await sql`update rmf_agent_approvals set status='approved',decided_at=now() where id=${approvalId}`;
  await sql`update rmf_agent_runs set status='approved_requeued',closure_state='approved_requeued' where id=${item.run_id}`;
  await sql`update rmf_agent_signals set status='approved_requeued' where id=${item.signal_id}`;
  const queued = await sql`insert into rmf_agent_signals(source,kind,payload,status,requested_authority) values(${auth.actor||'owner-approval'},${item.kind},${sql.json(approvedPayload as any)},'queued',${item.requested_authority}) returning id,status,requested_authority,created_at`;
  await sql`insert into rmf_agent_ledger(run_id,event,capability,authority,admissible,detail) values(${item.run_id},'owner_approved_requeued',${item.capability},${item.requested_authority},true,${sql.json({ approval_id:approvalId, new_signal_id:queued[0].id, actor:auth.actor } as any)})`;

  return NextResponse.json({ ok:true, decision:"approved", approval_id:approvalId, requeued_signal:queued[0], actor:auth.actor, hard_max_authority:Number(process.env.RMF_OPERATOR_MAX_AUTHORITY||1), note:"Approval is recorded, but execution remains capped by RMF_OPERATOR_MAX_AUTHORITY." });
}
