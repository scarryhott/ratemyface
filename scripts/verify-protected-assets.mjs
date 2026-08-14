import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(await readFile(join(root, "POLICY_INVARIANTS.json"), "utf8"));
const guards = policy?.protected_assets?.rate_my_face_gpt_instructions?.repository_guards;

if (!Array.isArray(guards) || guards.length === 0) {
  throw new Error("protected_instruction_hash_guards_missing");
}

for (const guard of guards) {
  const bytes = await readFile(join(root, String(guard.path)));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== guard.sha256) {
    throw new Error(`protected_instruction_hash_mismatch:${guard.path}`);
  }
}

console.log(`Protected instruction hashes verified (${guards.length} files).`);
