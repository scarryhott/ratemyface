# Closure-Native Builder Harness v1

This is the active builder-agent architecture for the Rate My Face project. It is not a Custom GPT Action and it is not part of the user-facing GPT runtime.

## Separation

- **Taskset**: authenticated signals and deterministic probes define what is being attempted.
- **Harness**: relational closure evaluates candidate actions against configured tools, authority, reversibility, expected return, invariants, and owner approvals.
- **Runtime**: Vercel Functions + AI Gateway + Supabase/Postgres execute the harness.
- **Tools**: typed provider wrappers perform bounded external actions and return receipts.
- **Verifier**: every mutation must produce an independent return that is compared against the expected return before the run can close.

## Security envelope vs closure

`RMF_OPERATOR_MAX_AUTHORITY` is a hard capability ceiling. Possessing a credential never raises that ceiling.

Closure is a separate computation:

`signal -> context realization -> candidate paths -> invariant checks -> selected action -> tool return -> independent verification -> self-limit`

A candidate can be logically preferred but still be blocked by the security envelope. Conversely, permission alone never makes an action closed.

## Progressive admission invariant

The operator may continuously evolve its **context of potential additions**, but potential capabilities are descriptive only. They are not executable merely because the model proposed them, code for them could be written, or credentials exist.

Every capability moves through this closure relation:

`potential -> specified -> implemented-disabled -> probed -> verified -> documented -> reintegrated -> admitted`

The transition to the next capability is closed only when the current capability has completed the full cycle. In particular:

1. **Potential** — the agent may research, compare, reason about, and record possible future tools, providers, credentials, GPT products, workflows, tests, and authority levels.
2. **Specified** — define the proposed capability, minimum authority, credential scope, invariants, expected return, verifier, rollback, failure modes, and evidence required for admission.
3. **Implemented-disabled** — implementation may exist only behind a hard-disabled gate. Creating an implementation does not make it callable by the active harness.
4. **Probed** — execute only the already-admitted bounded probe for that capability.
5. **Verified** — independent readback/verification must match the declared expected return. Failed or ambiguous probes remain unresolved and do not advance authority.
6. **Documented** — persist receipts, observed limitations, security boundary, rollback procedure, and what was actually proven. Do not replace evidence with a model assertion.
7. **Reintegrated** — the verified documentation and receipts become part of the agent's canonical context so future planning is conditioned on what the previous stage actually established.
8. **Admitted** — only after reintegration may the owner deliberately raise the capability/authority gate and begin the next stage.

Therefore:

`admit(C[n+1]) -> verified(C[n]) ∧ documented(C[n]) ∧ reintegrated(C[n]) ∧ owner_authorized(C[n+1])`

Potential additions may accumulate without bound as planning context, but executable authority advances one closed layer at a time.

## Credential integration invariant

Credentials are capabilities, not knowledge and not proof. The agent may know that a future integration needs a credential and may document the required scope, but it must never fabricate, infer, expose, copy into repository context, or automatically broaden credentials.

Credential progression is owner-assisted:

`need identified -> minimum scope specified -> owner provisions secret -> configuration presence verified without revealing value -> bounded probe -> receipt verified -> documentation reintegrated -> owner admits next scope`

Rules:

- Secrets remain in provider/Vercel secret storage, never Git, prompts, model context, receipts, logs, Markdown, or generated artifacts.
- The agent tests presence and capability, not secret values.
- Add the minimum credential scope needed for the next already-specified probe.
- Never request full-account/full-organization scope when repository/project/resource scope is sufficient.
- A newly configured credential remains unusable above `RMF_OPERATOR_MAX_AUTHORITY` until the owner deliberately raises that ceiling.
- Credential expansion is itself an authority transition and requires owner participation.
- Eventually broad operational access is achieved by the union of individually proven bounded capabilities, not by one initial omnipotent credential.

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
Reads the configured repository and current base commit.

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

This is the first evidence-producing control test. General branch editing is not admitted until this capability is proven, documented, reintegrated, and explicitly advanced by the owner.

## Durable state

The harness stores signals, runs, ledger events, approvals, receipts, canonical context, projects, and GPT registry state. Verified receipts are the evidence boundary between one admission stage and the next.

The project/GPT registry is the beginning of the future GPT factory. Custom GPTs remain products operated by this control plane, not hosts for the operator itself.

## Introspection

`GET /api/operator/capabilities` returns non-secret capability/configuration state and current GitHub base context.

`GET /api/operator/status` returns recent signal/run/approval/receipt/ledger state.

## First control probe

Keep `RMF_OPERATOR_MAX_AUTHORITY=1` while observing. A control-probe signal requesting L2 must close to `awaiting_approval` rather than mutating anything.

After the L1 self-limit is documented, the owner can configure a fine-grained `GITHUB_OPERATOR_TOKEN` scoped only to this repository with the minimum required Contents permission and deliberately set `RMF_OPERATOR_MAX_AUTHORITY=2`. The L2 probe then demonstrates isolated branch control and independently verifies the return. Success requires a persisted receipt with `verified=true`; the harness still does not merge the branch.

## Evolution queue

While a stage is being proven, the agent should maintain planning context for likely later additions without activating them. Examples include sandbox/code patching, Vercel preview verification, deployment/log observation, bounded production experiments, Stripe business reads, Supabase operational tools, GPT-product registry/factory operations, and additional provider integrations.

For each potential addition, planning should seek the smallest testable closure relation:

`declared intent + bounded authority + explicit invariants + independent return + rollback + owner gate`

Do not build a later-stage operational capability merely because it appears useful. First close the currently admitted layer.

## Execution-bearing managerial loop

Persistent business agents supervise a feature backlog (`operator/FEATURE_BACKLOG.json`): Account Learning, Compare Me To Me, Appearance Agent, Social OAuth. Status is derived from repo/production evidence (flags, OpenAPI, health, tables), not heartbeat or run counts.

Intended cycle:

`goal → inspect repo → select next unfinished feature → implement/dispatch → test → PR → verify production → receipt → next feature`

`GET /api/operator/heartbeat` only enqueues an idempotent `business_improve` signal. `GET|POST /api/operator/run` is the worker. A heartbeat, strategy report, or observe-only tool is a failed/no-op cycle when unfinished work exists — not feature progress. The backlog advances only on a verified `feature_production_verify` receipt.

L2 `github_implementation_dispatch` is the sanctioned write path for an unfinished item: isolated `agent/run-*-dispatch` branch, one dispatch artifact, optional draft PR, no merge. If `RMF_OPERATOR_MAX_AUTHORITY < 2` or `GITHUB_OPERATOR_TOKEN` is missing, the cycle records `blocked-on` approval or missing secret.

## Next admission after repeated successful probes

After the GitHub L2 control probe is verified, documented, and reintegrated, the next candidate is an L2 sandbox/code-patch capability that writes only to an isolated branch, executes build/tests in a sandbox, and closes only if the independent verifier returns the expected result. L3 preview deployment follows only after that layer closes.
