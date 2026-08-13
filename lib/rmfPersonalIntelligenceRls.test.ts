import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(ROOT, "supabase", "migrations", "20260813205051_create_personal_intelligence_suite.sql");
const TABLES = [
  "rmf_product_outcomes",
  "rmf_social_outcomes",
  "rmf_reference_comparisons",
  "rmf_reference_observations",
  "rmf_personal_agent_runs",
  "rmf_personal_agent_actions",
  "rmf_personal_agent_receipts"
] as const;

describe("Personal Intelligence RLS migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("creates relational integrity and bounded state constraints", () => {
    assert.match(sql, /foreign key \(recommendation_id, user_id\)/i);
    assert.match(sql, /foreign key \(comparison_id, user_id\)/i);
    assert.match(sql, /foreign key \(run_id, user_id\)/i);
    assert.match(sql, /foreign key \(action_id, user_id\)/i);
    assert.match(sql, /authority smallint not null default 0 check \(authority >= 0 and authority <= 1\)/i);
    assert.match(sql, /requires_approval boolean not null default true/i);
  });

  it("enables own-row RLS without FORCE and grants authenticated SELECT only", () => {
    assert.equal(/\bforce\s+row\s+level\s+security\b/i.test(sql), false);
    for (const table of TABLES) {
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      assert.match(sql, new RegExp(`create policy ${table}_select_own[\\s\\S]*?auth\\.uid\\(\\)`, "i"));
      assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"));
      assert.match(sql, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
    }
    assert.equal(/\bfor insert\b/i.test(sql), false);
    assert.equal(/\bfor update\b/i.test(sql), false);
    assert.equal(/\bfor delete\b/i.test(sql), false);
  });

  it("indexes every composite foreign-key relation", () => {
    assert.match(sql, /rmf_product_outcomes_recommendation_user_idx[\s\S]*?\(recommendation_id, user_id\)/i);
    assert.match(sql, /rmf_reference_observations_comparison_user_idx[\s\S]*?\(comparison_id, user_id\)/i);
    assert.match(sql, /rmf_personal_agent_actions_run_user_idx[\s\S]*?\(run_id, user_id\)/i);
    assert.match(sql, /rmf_personal_agent_receipts_action_user_idx[\s\S]*?\(action_id, user_id\)/i);
  });
});
