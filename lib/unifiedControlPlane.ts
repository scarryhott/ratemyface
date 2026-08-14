import { db, isUndefinedTableError } from "./db";
import type { OperatorToolReceipt } from "./operatorTools";
import {
  CONTROL_TABLES,
  PROTECTED_GPT_INSTRUCTION_HASH,
  PROTECTED_GPT_KEY,
  normalizeFeatureRegistration,
  normalizeGptFactoryRequest,
  summarizeUnifiedFeatures,
  unavailableUnifiedControlPlane,
  type FeatureAccess,
  type FeatureCategory,
  type FeatureLifecycle,
  type MonetizationStatus,
  type UnifiedControlPlaneView,
  type UnifiedFeatureView
} from "./unifiedControlPlaneShape";

export {
  CONTROL_TABLES,
  FEATURE_CATEGORIES,
  PROTECTED_GPT_INSTRUCTION_HASH,
  PROTECTED_GPT_KEY,
  UNIFIED_FEATURE_SEEDS,
  normalizeFeatureRegistration,
  normalizeGptFactoryRequest,
  unavailableUnifiedControlPlane
} from "./unifiedControlPlaneShape";
export type {
  EvidenceStatus,
  FeatureAccess,
  FeatureCategory,
  FeatureLifecycle,
  FeatureRegistration,
  GptFactoryRequest,
  MonetizationStatus,
  UnifiedControlPlaneView,
  UnifiedFeatureSeed,
  UnifiedFeatureView
} from "./unifiedControlPlaneShape";

export async function readUnifiedControlPlane(
  sql: any,
  existingTables: Set<string>
): Promise<UnifiedControlPlaneView> {
  if (!CONTROL_TABLES.every((table) => existingTables.has(table))) {
    return unavailableUnifiedControlPlane("control_plane_schema_not_applied");
  }

  const featureRows = await sql`
    select feature_key, name, category, lifecycle_status, access_status,
      monetization_status, evidence_status, source_of_truth, endpoint,
      database_objects, acceptance, priority, last_verified_at
    from rmf_control_features
    order by priority, feature_key
  `;
  const evidenceRows = await sql`
    select distinct on (feature_key)
      feature_key, evidence_type, provider, observed_state, passed,
      observed_at, external_ref
    from rmf_control_feature_evidence
    order by feature_key, observed_at desc, id desc
  `;
  const agentRows = await sql`
    select agent_key, display_name, role, status, feature_access,
      auth_user_id, entitlements, last_verified_at
    from rmf_control_agent_identities
    order by agent_key
  `;
  const gptRows = await sql`
    select gpt_key, protected, creator_mode, factory_enabled, status,
      instruction_hash
    from rmf_control_gpt_specs
    order by gpt_key
  `;
  const jobRows = await sql`
    select status, count(*)::int as total
    from rmf_control_gpt_jobs
    group by status
  `;
  const metricRows = await sql`
    select distinct on (source, metric_key)
      source, metric_key, numeric_value::text, text_value, unit,
      observed_at, source_ref
    from rmf_control_metric_snapshots
    order by source, metric_key, observed_at desc, id desc
    limit 60
  `;

  const evidenceByFeature = new Map<string, any>();
  for (const row of evidenceRows) evidenceByFeature.set(String(row.feature_key), row);
  const features = featureRows.map((row: any): UnifiedFeatureView => {
    const evidence = evidenceByFeature.get(String(row.feature_key));
    return {
      feature_key: String(row.feature_key),
      name: String(row.name),
      category: row.category as FeatureCategory,
      lifecycle_status: row.lifecycle_status as FeatureLifecycle,
      access_status: row.access_status as FeatureAccess,
      monetization_status: row.monetization_status as MonetizationStatus,
      evidence_status: row.evidence_status,
      source_of_truth: String(row.source_of_truth),
      endpoint: row.endpoint == null ? null : String(row.endpoint),
      database_objects: Array.isArray(row.database_objects) ? row.database_objects.map(String) : [],
      acceptance: Array.isArray(row.acceptance) ? row.acceptance.map(String) : [],
      priority: Number(row.priority),
      last_verified_at: row.last_verified_at == null ? null : String(row.last_verified_at),
      latest_evidence: evidence
        ? {
            evidence_type: String(evidence.evidence_type),
            provider: String(evidence.provider),
            observed_state: String(evidence.observed_state),
            passed: Boolean(evidence.passed),
            observed_at: String(evidence.observed_at),
            external_ref: evidence.external_ref == null ? null : String(evidence.external_ref)
          }
        : null
    };
  });
  const jobCounts = new Map<string, number>();
  for (const row of jobRows) jobCounts.set(String(row.status), Number(row.total));
  const protectedRow = gptRows.find((row: any) => String(row.gpt_key) === PROTECTED_GPT_KEY);

  return {
    schema_ready: true,
    reason: null,
    tables: CONTROL_TABLES,
    summary: summarizeUnifiedFeatures(features),
    features,
    agents: agentRows.map((row: any) => ({
      agent_key: String(row.agent_key),
      display_name: String(row.display_name),
      role: String(row.role),
      status: String(row.status),
      feature_access: String(row.feature_access),
      auth_user_linked: Boolean(row.auth_user_id),
      entitlement_count: Array.isArray(row.entitlements) ? row.entitlements.length : 0,
      last_verified_at: row.last_verified_at == null ? null : String(row.last_verified_at)
    })),
    gpt_factory: {
      protected_gpt: {
        gpt_key: PROTECTED_GPT_KEY,
        creator_mode: "human_only",
        factory_enabled: false,
        instruction_hash: String(protectedRow?.instruction_hash || PROTECTED_GPT_INSTRUCTION_HASH)
      },
      factory_enabled_specs: gptRows.filter((row: any) => Boolean(row.factory_enabled) && !row.protected).length,
      queued: jobCounts.get("queued") || 0,
      running: jobCounts.get("running") || 0,
      awaiting_human: jobCounts.get("awaiting_human") || 0,
      completed: jobCounts.get("completed") || 0,
      failed: jobCounts.get("failed") || 0
    },
    monetary_snapshots: metricRows.map((row: any) => ({
      source: String(row.source),
      metric_key: String(row.metric_key),
      numeric_value: row.numeric_value == null ? null : String(row.numeric_value),
      text_value: row.text_value == null ? null : String(row.text_value),
      unit: String(row.unit),
      observed_at: String(row.observed_at),
      source_ref: row.source_ref == null ? null : String(row.source_ref)
    }))
  };
}

export async function registerUnifiedFeature(input: Record<string, unknown>, actor: string) {
  const feature = normalizeFeatureRegistration(input);
  const sql = db();
  const rows = await sql`
    insert into rmf_control_features(
      feature_key, name, category, lifecycle_status, access_status,
      monetization_status, evidence_status, source_of_truth, endpoint,
      database_objects, acceptance, priority, metadata
    ) values(
      ${feature.feature_key}, ${feature.name}, ${feature.category},
      ${feature.lifecycle_status}, ${feature.access_status}, ${feature.monetization_status},
      'unverified', ${feature.source_of_truth}, ${feature.endpoint},
      ${sql.json(feature.database_objects as any)}, ${sql.json(feature.acceptance as any)},
      ${feature.priority}, ${sql.json({ registered_by: actor } as any)}
    )
    on conflict (feature_key) do update set
      name = excluded.name,
      category = excluded.category,
      lifecycle_status = excluded.lifecycle_status,
      access_status = excluded.access_status,
      monetization_status = excluded.monetization_status,
      source_of_truth = excluded.source_of_truth,
      endpoint = excluded.endpoint,
      database_objects = excluded.database_objects,
      acceptance = excluded.acceptance,
      priority = excluded.priority,
      metadata = rmf_control_features.metadata || excluded.metadata,
      evidence_status = case
        when rmf_control_features.evidence_status = 'verified' then 'stale'
        else rmf_control_features.evidence_status
      end,
      updated_at = now()
    returning feature_key, lifecycle_status, access_status, evidence_status, updated_at
  `;
  return rows[0];
}

export async function queueGptFactoryJob(input: Record<string, unknown>, actor: string) {
  const request = normalizeGptFactoryRequest(input);
  const sql = db();
  return await sql.begin(async (tx) => {
    await tx`
      insert into rmf_control_gpt_specs(
        gpt_key, name, protected, creator_mode, factory_enabled, status,
        agent_generated_configuration
      ) values(
        ${request.gpt_key}, ${request.name}, false, 'agent_factory', true,
        'queued', ${tx.json(request.configuration as any)}
      )
      on conflict (gpt_key) do update set
        name = excluded.name,
        status = 'queued',
        agent_generated_configuration = excluded.agent_generated_configuration,
        updated_at = now()
      where rmf_control_gpt_specs.protected = false
    `;
    const rows = await tx`
      insert into rmf_control_gpt_jobs(
        gpt_key, requested_by, configuration, idempotency_key, protected_asset_check
      ) values(
        ${request.gpt_key}, ${actor}, ${tx.json(request.configuration as any)},
        ${request.idempotency_key}, 'passed'
      )
      on conflict (idempotency_key) do update set
        updated_at = rmf_control_gpt_jobs.updated_at
      returning id, gpt_key, status, idempotency_key, created_at
    `;
    return rows[0];
  });
}

function canonicalReceiptFeatureKey(value: unknown): string | null {
  const key = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_]{1,79}$/.test(key) ? key : null;
}

export async function recordUnifiedFeatureReceipt(
  runId: number,
  operatorReceiptId: number,
  receipt: OperatorToolReceipt
): Promise<boolean> {
  if (receipt.tool !== "feature_production_verify") return false;
  const featureKey = canonicalReceiptFeatureKey(receipt.observed.feature_id);
  if (!featureKey) return false;

  const sql = db();
  try {
    return await sql.begin(async (tx) => {
      const known = await tx`
        select feature_key from rmf_control_features where feature_key = ${featureKey}
      `;
      if (!known.length) return false;
      await tx`
        insert into rmf_control_feature_evidence(
          feature_key, evidence_type, provider, observed_state, passed,
          run_id, operator_receipt_id, external_ref, payload
        ) values(
          ${featureKey}, 'production_health', 'vercel',
          ${receipt.verified ? "verified" : "failed"}, ${receipt.verified},
          ${runId}, ${operatorReceiptId}, ${receipt.external_ref},
          ${tx.json({ expected: receipt.expected, observed: receipt.observed, detail: receipt.detail } as any)}
        )
      `;
      await tx`
        update rmf_control_features
        set evidence_status = ${receipt.verified ? "verified" : "failed"},
          lifecycle_status = case
            when ${receipt.verified} and lifecycle_status in ('planned', 'building', 'testing') then 'active'
            else lifecycle_status
          end,
          access_status = case when ${receipt.verified} then 'available' else access_status end,
          last_verified_at = now(),
          updated_at = now()
        where feature_key = ${featureKey}
      `;
      return true;
    });
  } catch (error) {
    if (isUndefinedTableError(error)) return false;
    throw error;
  }
}
