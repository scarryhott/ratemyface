# Closure-Native Builder Harness v1

This is the active builder-agent architecture for the Rate My Face project. It is not a Custom GPT Action and it is not part of the user-facing GPT runtime.

## Separation

- **Taskset**: authenticated signals and deterministic probes define what is being attempted.
- **Harness**: relational closure evaluates candidate actions against configured tools, authority, reversibility, expected return, invariants, and owner approvals.
- **Runtime**: Vercel Functions + AI Gateway + Supabase/Postgres execute the harness.
- **Tools**: typed provider wrappers perform bounded external actions and return receipts.
- **Verifier**: every mutation must produce an independent return that is compared against the expected return before the run can close.

This deliberately borrows the useful separation of task/harness/runtime from modern agent systems while keeping closure computation distinct from the external security envelope.

## Security envelope vs closure

`RMF_OPERATOR_MAX_AUTHORITY` is a hard capability ceiling. Possessing a credential never raises that ceiling.

Closure is a separate computation:

`signal -> context realization -> candidate paths -> invariant checks -> selected action -> tool return -> independent verification -> self-limit`

A candidate can be logically preferred but still be blocked by the security envelope. Conversely, permission alone never makes an action closed.

## Authority

- L0 observe
- L1 analyze
- L2 isolated branch/sandbox
- L3 preview deployment
- L4 bounded reversible production experiment
- L5 bounded economic/model spend
- L6 strategic/permission expansion

v1 only implements L0 reads and one tightly bounded L2 GitHub control probe.

## Implemented tools

### `project_context_read` — L0
Returns non-secret deployment metadata, model selection, hard authority ceiling, target repository, and tool configuration state.

### `github_read` — L0
Reads the configured repository and current base commit. It can read the public Rate My Face repository without a write token.

### `github_branch_diagnostic` — L2
This is intentionally not a general code-writing tool. It performs exactly one control demonstration:

1. read the current base SHA;
2. create `agent/run-<run-id>-closure-probe` from that SHA;
3. write one deterministic JSON artifact under `agent-runs/`;
4. read the artifact back independently;
5. compare expected and observed SHA-256 digests;
6. verify the artifact path is absent from the base branch;
7. record the branch/commit as an external receipt and rollback reference;
8. halt without merging.

This is the first evidence-producing control test. General branch editing should not be admitted until this succeeds repeatedly.

## Durable state

The harness stores:

- `rmf_agent_signals`
- `rmf_agent_runs`
- `rmf_agent_ledger`
- `rmf_agent_approvals`
- `rmf_agent_receipts`
- `rmf_agent_context`
- `rmf_agent_projects`
- `rmf_agent_gpts`

The project/GPT registry is the beginning of the future GPT factory. The Custom GPTs remain products operated by this control plane, not hosts for the operator itself.

## Introspection

Authenticated owner request:

`GET /api/operator/capabilities`

Returns non-secret capability/configuration state and current GitHub base context.

`GET /api/operator/status`

Returns the recent signal/run/approval/receipt/ledger state.

## First control probe

Keep `RMF_OPERATOR_MAX_AUTHORITY=1` while observing. A control-probe signal requesting L2 should close to `awaiting_approval` rather than mutating anything.

After deliberately configuring a fine-grained `GITHUB_OPERATOR_TOKEN` scoped only to this repository with Contents read/write and setting `RMF_OPERATOR_MAX_AUTHORITY=2`, enqueue:

```json
{
  "source": "owner",
  "kind": "control_probe",
  "requested_authority": 2,
  "payload": {
    "goal": "Demonstrate isolated GitHub branch control and independently verify the return."
  }
}
```

Then run one queued signal. Success requires a persisted receipt with `verified=true`. The harness still does not merge the branch.

## Next admission after repeated successful probes

The next capability should be an L2 sandbox/code-patch tool that writes only to an isolated branch, executes build/tests in Vercel Sandbox, and closes only if the independent verifier returns the expected result. L3 preview deployment should follow after that, not precede it.
