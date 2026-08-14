# Unified Rate My Face Agent Operating System

## Objective

Build and operate the complete unified Rate My Face business platform, converting authorized goals into verified customer value while minimizing elapsed time, model spend, infrastructure spend, and owner interruption.

The terminal unit of work is a receipt, not an activity report.

```text
goal -> task capsule -> execute -> verify -> receipt -> next task
```

## Transcript Baseline

The supplied transcript is 1,796 lines and about 78 KB. Simple phrase counts show the operational drag:

- `still`: 83 lines
- `waiting` or `wait`: 24 lines
- `stuck`, `freeze`, `hung`, or similar: 25 lines
- browser or driver crashes: 6 lines
- `504` or `timeout`: 21 lines
- owner handoffs: 14 lines
- PR references: 134 lines

The transcript also records revenue snapshots of zero Stripe Checkout Sessions and zero Amazon earnings despite extensive monitoring and infrastructure work. These are historical measurements, but they expose the wrong optimization target.

The recent MCP secret setup repeated the same pattern: the Vercel destination was configured before the MCP client destination was located. The generated value then could not be reused and must be rotated. The correct workflow preflights every destination before generating the secret.

## Failure Model

1. Browser-first execution made API-capable work slow and fragile.
2. Unbounded narration and waiting replaced explicit deadlines and retries.
3. Planner-to-agent chat loops repeatedly retransmitted large context.
4. Monitoring reloaded the whole business instead of checking deltas.
5. Protected GPT instructions were edited without a recoverable exact snapshot.
6. A merge or deployment was often treated as completion before user-path verification.
7. Product credits, hosting credits, and model spend were initially conflated.
8. Revenue work lost priority to dashboards, scaffolds, disabled features, and status loops.
9. The owner was asked to intervene before all non-interactive paths were exhausted.
10. Retried or stale work could starve the current backlog item.

## Runtime Architecture

### Deterministic Supervisor

Run cheap code on a schedule or event trigger. It reads only deltas:

- GitHub SHA and check state
- Vercel deployment ID and new runtime errors
- Railway service health changes
- Supabase health and selected counter changes
- Stripe events and conversion counters
- backlog and lease state

If nothing changed, stop without invoking a reasoning model.

### Task Queue

Every task has one owner, one lease, bounded retries, and one acceptance contract. A stale task cannot return to the front forever.

States:

```text
queued -> preflight -> executing -> verifying -> complete
                                  -> retryable_failure -> queued
                                  -> blocked
```

Rules:

- One active task per mutable surface.
- Retry transient failures at most twice.
- Use exponential backoff outside the model loop.
- Dead-letter a repeatedly failing task with evidence.
- A monitor can enqueue work but cannot mark it complete.

### Builder

The builder receives only the current task capsule and relevant files or evidence. It does not receive the full transcript by default.

The builder may implement, test, open a PR, merge when authorized, deploy, and verify. It must not alter protected assets or expand product scope.

### Verifier

Verification must use the closest available user path. Database rows, API probes, and deployment readiness are supporting evidence, not substitutes for a required end-to-end result.

## Context System

Use four layers:

1. Durable business context: goals, economics, protected assets, and standing decisions.
2. Current state: latest SHA, deployments, feature flags, balances, blockers, and last event cursors.
3. Task capsule: one objective, acceptance criteria, scope, budget, and relevant evidence.
4. Receipts: immutable proof of completed work and measured outcome.

Do not replay old status messages. Store hashes, IDs, counters, and concise decisions. A new run loads layers 1-3 and only the receipts referenced by the task.

## Task Capsule

```yaml
task_id: unique-id
objective: one measurable outcome
why_now: business or incident reason
acceptance:
  - observable pass condition
scope:
  allowed: []
  forbidden: []
protected_assets: []
dependencies: []
budget:
  wall_clock_seconds: 900
  max_model_usd: 1.00
  max_tool_calls: 40
  max_retries: 2
expected_value:
  customer_value: high
  revenue_hypothesis: explicit or none
verification:
  method: end-to-end path
rollback: concrete recovery method
```

The numbers are examples. Set them from task risk and value, not as global defaults.

## Tool Routing

Use this order:

1. Purpose-built connector or API
2. Authenticated CLI
3. Direct HTTP probe
4. Browser automation
5. Owner handoff for password, captcha, 2FA, purchase, legal consent, or an unavailable permission

Read-only checks that do not depend on one another run concurrently. Browser tabs are not a task queue. Keep one tab per active interactive flow and close terminal flows.

Before waiting, record the external operation ID and expected terminal state. Poll by ID with a deadline. Never wait on a page animation or narrate repeated unchanged state.

## Mutation Policy

Before any external write:

- resolve the exact target and account
- confirm the task authorizes the write
- snapshot or hash mutable configuration
- check the protected-assets list
- define verification and rollback

The Rate My Face GPT instructions are an absolute protected asset. AI write access is permanently denied, even when an ordinary task or broader business objective could be interpreted as authorization. Harry performs any edit manually. Agents may use a read-only hash to detect drift, but may not restore, synchronize, reproduce, or publish the text.

## Atomic Secret Workflow

Use this sequence for `RMF_CHATGPT_MCP_TOKEN` and similar credentials:

1. Resolve every destination: Vercel project/environment and the exact MCP client configuration.
2. Resolve dependent identity values such as the scoped Rate My Face user UUID.
3. Confirm both destinations are writable and determine whether a redeploy or restart is required.
4. Generate one secret in protected process memory or a mode-`0600` temporary file.
5. Write the same value to every destination without printing it.
6. Redeploy or restart affected services.
7. Probe the authenticated endpoint and verify the returned user scope.
8. Delete the temporary material and record only secret fingerprints or version IDs.

If any destination is unknown, stop before generation. A one-sided secret install is a failed rotation, not partial success.

Target for a pre-authorized two-destination rotation: under 90 seconds excluding external deployment time and interactive authentication.

## Cost And Credit Controller

Keep three ledgers separate:

- Customer product credits: entitlement and pricing visible to users.
- Agent compute: model tokens, browser time, and tool calls.
- Infrastructure: Vercel, Railway, Supabase, and third-party service costs.

Routing policy:

- No model for unchanged monitoring.
- Low-cost model for classification, extraction, and bounded triage.
- Strong builder model for code changes or ambiguous incidents.
- Highest-cost reasoning only when a measured quality gain justifies it.
- Cache stable context and send task-specific deltas.
- Stop a run when its budget is exhausted; preserve state for a deliberate continuation.

Track:

- agent cost per verified receipt
- tokens and tool calls per completed task
- elapsed time to first useful action
- owner interventions per task
- retry and timeout rate
- revenue or activation change per experiment

## Revenue Controller

Rank work using evidence, not excitement:

```text
priority = (customer_value * revenue_potential * confidence * urgency)
           / (time_to_ship * agent_cost * operational_risk)
```

Security and production incidents override the score.

Measure two funnels independently:

```text
paid feature:
free use -> account -> paid-feature intent -> entitlement check -> checkout
-> payment -> credit grant -> successful feature result -> repeat use

affiliate:
relevant recommendation -> tagged click -> ordered item -> shipped item
-> commission
```

Find the first stage with material drop-off and run one bounded experiment against it. Do not optimize a later stage while an earlier stage is unproven. Do not change protected GPT instructions or working affiliate behavior to run an experiment; use the web product, backend, or another owner-authorized surface.

For monetization work, a PR is an intermediate result. The receipt must include a production funnel event such as feature activation, checkout creation, successful payment, paid-feature use, retention, or affiliate conversion. If no event occurs, record the experiment as unproven and choose the next hypothesis.

The transcript suggests a near-term rule: verify that already-built subscription features are actually exposed and usable before adding more scaffolds, monitoring, or dashboards.

## Communication

Send an update only when one of these changes:

- execution phase
- concrete result
- blocker requiring owner action
- material risk or scope decision

Do not send repeated `still waiting` messages. For operations over 30 seconds, send one update with the operation ID, deadline, and next automatic action. Report completion with evidence and remaining risk.

## Receipt

```json
{
  "task_id": "unique-id",
  "outcome": "passed|failed|blocked",
  "artifact": {"commit": null, "deployment": null, "url": null},
  "acceptance": [{"criterion": "...", "passed": true, "evidence": "..."}],
  "cost": {"model_usd": 0, "tool_calls": 0, "wall_clock_seconds": 0},
  "business": {"metric": null, "before": null, "after": null},
  "protected_asset_hashes": {},
  "next_action": null
}
```

No receipt means the task remains incomplete.
