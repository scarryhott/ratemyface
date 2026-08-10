import { createHash } from "node:crypto";

export type Authority = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type OperatorToolName =
  | "project_context_read"
  | "github_read"
  | "github_branch_diagnostic";

export interface OperatorToolSpec {
  name: OperatorToolName;
  authority: Authority;
  mutating: boolean;
  reversible: boolean;
  description: string;
}

export interface OperatorToolContext {
  runId: number;
  signalId: number;
  admittedAuthority: Authority;
}

export interface OperatorToolReceipt {
  tool: OperatorToolName;
  authority: Authority;
  request_digest: string;
  expected: Record<string, unknown>;
  observed: Record<string, unknown>;
  verified: boolean;
  rollback_ref: string | null;
  external_ref: string | null;
  detail: Record<string, unknown>;
}

const TOOL_SPECS: Record<OperatorToolName, OperatorToolSpec> = {
  project_context_read: {
    name: "project_context_read",
    authority: 0,
    mutating: false,
    reversible: true,
    description: "Read non-secret runtime/project configuration and tool availability."
  },
  github_read: {
    name: "github_read",
    authority: 0,
    mutating: false,
    reversible: true,
    description: "Read the configured GitHub repository and current base commit."
  },
  github_branch_diagnostic: {
    name: "github_branch_diagnostic",
    authority: 2,
    mutating: true,
    reversible: true,
    description: "Create an isolated agent/run-* branch, write one diagnostic receipt, read it back, and never merge it."
  }
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function githubConfig() {
  const repository = process.env.RMF_OPERATOR_GITHUB_REPO || "scarryhott/ratemyface";
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("RMF_OPERATOR_GITHUB_REPO_must_be_owner_repo");
  return {
    repository,
    owner,
    repo,
    base: process.env.RMF_OPERATOR_GITHUB_BASE || "main",
    token: process.env.GITHUB_OPERATOR_TOKEN || ""
  };
}

interface GithubResponse {
  ok: boolean;
  status: number;
  data: any;
}

async function githubRequest(
  path: string,
  init: RequestInit = {},
  requireAuth = false
): Promise<GithubResponse> {
  const cfg = githubConfig();
  if (requireAuth && !cfg.token) throw new Error("GITHUB_OPERATOR_TOKEN_not_configured");

  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2026-03-10");
  headers.set("User-Agent", "ratemyface-closure-operator");
  if (cfg.token) headers.set("Authorization", `Bearer ${cfg.token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { text: text.slice(0, 1000) };
    }
  }
  return { ok: response.ok, status: response.status, data };
}

function assertGithub(result: GithubResponse, operation: string): any {
  if (!result.ok) {
    const message = String(result.data?.message || result.data?.text || "unknown_error").slice(0, 500);
    throw new Error(`${operation}_github_${result.status}:${message}`);
  }
  return result.data;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeGithubContent(data: any): string {
  const encoded = String(data?.content || "").replace(/\n/g, "");
  return Buffer.from(encoded, "base64").toString("utf8");
}

export function getOperatorToolRegistry() {
  const cfg = githubConfig();
  return Object.values(TOOL_SPECS).map((spec) => ({
    ...spec,
    configured:
      spec.name === "github_branch_diagnostic" ? Boolean(cfg.token) : true
  }));
}

export function getOperatorToolSpec(name: string): OperatorToolSpec | null {
  return (TOOL_SPECS as Record<string, OperatorToolSpec>)[name] || null;
}

export async function projectContextRead(): Promise<Record<string, unknown>> {
  const cfg = githubConfig();
  return {
    harness: "closure-native-v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    deployment: {
      url: process.env.VERCEL_URL || null,
      git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      git_commit_ref: process.env.VERCEL_GIT_COMMIT_REF || null
    },
    github: {
      repository: cfg.repository,
      base: cfg.base,
      write_configured: Boolean(cfg.token)
    },
    max_authority: Number(process.env.RMF_OPERATOR_MAX_AUTHORITY || 1),
    model: process.env.RMF_OPERATOR_MODEL || "openai/gpt-5.6-terra",
    tools: getOperatorToolRegistry()
  };
}

export async function githubRead(): Promise<Record<string, unknown>> {
  const cfg = githubConfig();
  const repoResult = await githubRequest(`/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`);
  const repo = assertGithub(repoResult, "github_read_repo");
  const commitResult = await githubRequest(
    `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/commits/${encodeURIComponent(cfg.base)}`
  );
  const commit = assertGithub(commitResult, "github_read_commit");

  return {
    repository: cfg.repository,
    private: Boolean(repo?.private),
    default_branch: String(repo?.default_branch || cfg.base),
    base: cfg.base,
    base_sha: String(commit?.sha || ""),
    updated_at: repo?.updated_at || null,
    pushed_at: repo?.pushed_at || null,
    write_configured: Boolean(cfg.token)
  };
}

async function getBranchRef(branch: string): Promise<GithubResponse> {
  const cfg = githubConfig();
  return githubRequest(
    `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/ref/${encodePath(`heads/${branch}`)}`
  );
}

async function getFile(path: string, ref: string): Promise<GithubResponse> {
  const cfg = githubConfig();
  return githubRequest(
    `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`
  );
}

export async function githubBranchDiagnostic(
  context: OperatorToolContext
): Promise<OperatorToolReceipt> {
  const spec = TOOL_SPECS.github_branch_diagnostic;
  if (context.admittedAuthority < spec.authority) throw new Error("github_branch_diagnostic_authority_denied");

  const cfg = githubConfig();
  if (!cfg.token) throw new Error("GITHUB_OPERATOR_TOKEN_not_configured");

  const before = await githubRead();
  const baseSha = String(before.base_sha || "");
  if (!baseSha) throw new Error("github_branch_diagnostic_missing_base_sha");

  const branch = `agent/run-${context.runId}-closure-probe`;
  const artifactPath = `agent-runs/run-${context.runId}.json`;
  const artifact = {
    harness: "closure-native-v1",
    run_id: context.runId,
    signal_id: context.signalId,
    base_branch: cfg.base,
    base_sha: baseSha,
    isolated_branch: branch,
    action: "github_branch_diagnostic",
    invariant: "write_isolated_diagnostic_only;do_not_merge;do_not_modify_base"
  };
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  const expectedDigest = sha256(artifactText);
  const requestDigest = digestJson({
    tool: spec.name,
    run_id: context.runId,
    signal_id: context.signalId,
    base_sha: baseSha,
    branch,
    artifact_path: artifactPath,
    artifact_digest: expectedDigest
  });

  let branchRef = await getBranchRef(branch);
  if (branchRef.status === 404) {
    const createRef = await githubRequest(
      `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/refs`,
      {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha })
      },
      true
    );
    assertGithub(createRef, "github_create_probe_branch");
    branchRef = await getBranchRef(branch);
  }
  const branchData = assertGithub(branchRef, "github_read_probe_branch");
  const branchStartSha = String(branchData?.object?.sha || "");

  let writeCommitSha: string | null = null;
  let existing = await getFile(artifactPath, branch);
  if (existing.status === 404) {
    const createFile = await githubRequest(
      `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${encodePath(artifactPath)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `Agent closure probe run ${context.runId}`,
          content: Buffer.from(artifactText, "utf8").toString("base64"),
          branch
        })
      },
      true
    );
    const created = assertGithub(createFile, "github_write_probe_artifact");
    writeCommitSha = String(created?.commit?.sha || "") || null;
    existing = await getFile(artifactPath, branch);
  }

  const readback = assertGithub(existing, "github_readback_probe_artifact");
  const observedText = decodeGithubContent(readback);
  const observedDigest = sha256(observedText);

  const basePath = await getFile(artifactPath, cfg.base);
  const basePathAbsent = basePath.status === 404;
  const branchAfterResult = await getBranchRef(branch);
  const branchAfter = assertGithub(branchAfterResult, "github_read_probe_branch_after");
  const branchHeadSha = String(branchAfter?.object?.sha || "");

  const verified =
    observedDigest === expectedDigest &&
    basePathAbsent &&
    Boolean(branchHeadSha) &&
    branchHeadSha !== baseSha;

  return {
    tool: spec.name,
    authority: spec.authority,
    request_digest: requestDigest,
    expected: {
      base_sha: baseSha,
      branch,
      artifact_path: artifactPath,
      artifact_digest: expectedDigest,
      base_path_absent: true
    },
    observed: {
      branch_start_sha: branchStartSha,
      branch_head_sha: branchHeadSha,
      artifact_digest: observedDigest,
      base_path_absent: basePathAbsent,
      artifact_blob_sha: readback?.sha || null
    },
    verified,
    rollback_ref: `refs/heads/${branch}`,
    external_ref: writeCommitSha || branchHeadSha || null,
    detail: {
      repository: cfg.repository,
      base: cfg.base,
      branch,
      artifact_path: artifactPath,
      merged: false
    }
  };
}

export async function executeOperatorTool(
  name: OperatorToolName,
  args: Record<string, unknown>,
  context: OperatorToolContext
): Promise<OperatorToolReceipt> {
  const spec = TOOL_SPECS[name];
  if (!spec) throw new Error(`unknown_operator_tool:${name}`);
  if (context.admittedAuthority < spec.authority) throw new Error(`operator_tool_authority_denied:${name}`);

  if (name === "project_context_read") {
    const observed = await projectContextRead();
    return {
      tool: name,
      authority: spec.authority,
      request_digest: digestJson({ name, args, run_id: context.runId }),
      expected: { readable: true },
      observed,
      verified: true,
      rollback_ref: null,
      external_ref: null,
      detail: { mutating: false }
    };
  }

  if (name === "github_read") {
    const observed = await githubRead();
    return {
      tool: name,
      authority: spec.authority,
      request_digest: digestJson({ name, args, run_id: context.runId }),
      expected: { base_sha_present: true },
      observed,
      verified: Boolean(observed.base_sha),
      rollback_ref: null,
      external_ref: String(observed.base_sha || "") || null,
      detail: { mutating: false }
    };
  }

  if (name === "github_branch_diagnostic") {
    return githubBranchDiagnostic(context);
  }

  throw new Error(`unimplemented_operator_tool:${name}`);
}
