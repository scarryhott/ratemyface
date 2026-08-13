/**
 * Pure Compare Me To Me Action helpers: real image-ref resolution + honest
 * visual result shaping. Placeholder refs are never treated as a real compare.
 */

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed.slice(0, 2000);
  }
  return null;
}

export type CompareImageRefs = {
  before_image_ref: string;
  after_image_ref: string;
  source: "request" | "profile" | "mixed";
};

export type CompareImageRefFailure = {
  ok: false;
  error: "image_refs_required";
  message: string;
  before_image_ref: string | null;
  after_image_ref: string | null;
};

export type CompareVisionAttempt =
  | {
      ok: true;
      model: string;
      summary: string;
      changes: string[];
      unchanged: string[];
      limitations: string[];
    }
  | {
      ok: false;
      reason: string;
    };

export type HonestCompareActionResult = {
  summary: string;
  score: Record<string, unknown>;
  data: Record<string, unknown>;
};

const ASIN_RE = /\bB0[A-Z0-9]{8,10}\b/gi;
const MEDICAL_RE =
  /\b(diagnos(?:e|is|ed)|treat(?:ment|ed)?|cure[ds]?|melanoma|carcinoma|cancer|disease|prescription|clinical|patholog(?:y|ic))\b/i;

export function coerceImageRef(value: unknown): string | null {
  if (typeof value === "string") return firstString(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    const nested = rec.image_url;
    const nestedUrl =
      nested && typeof nested === "object" && !Array.isArray(nested)
        ? firstString((nested as Record<string, unknown>).url)
        : null;
    return firstString(rec.url, rec.image_url, nestedUrl, rec.file_id, rec.ref, rec.id);
  }
  return null;
}

export function isPlaceholderImageRef(ref: string): boolean {
  const t = ref.trim().toLowerCase();
  return (
    t.startsWith("placeholder:") ||
    t.startsWith("fake:") ||
    t.startsWith("example:") ||
    t.includes("placeholder://") ||
    t === "placeholder"
  );
}

export function isUsableImageRef(ref: string | null | undefined): ref is string {
  if (!ref) return false;
  const t = ref.trim();
  if (t.length < 4) return false;
  if (isPlaceholderImageRef(t)) return false;
  return true;
}

export function httpsImageUrl(ref: string): string | null {
  try {
    const url = new URL(ref.trim());
    if (url.protocol === "https:") return url.toString();
  } catch {
    /* not a URL */
  }
  return null;
}

export function sanitizeCompareVisionText(text: string): string {
  return String(text || "")
    .replace(ASIN_RE, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

export function looksMedical(text: string): boolean {
  return MEDICAL_RE.test(text);
}

function pickRef(
  body: Record<string, unknown> | undefined,
  profile: Record<string, unknown> | null | undefined,
  bodyKeys: string[],
  profileKeys: string[]
): { ref: string | null; from: "request" | "profile" | null } {
  if (body) {
    for (const key of bodyKeys) {
      const ref = coerceImageRef(body[key]);
      if (isUsableImageRef(ref)) return { ref, from: "request" };
    }
  }
  if (profile) {
    for (const key of profileKeys) {
      const ref = coerceImageRef(profile[key]);
      if (isUsableImageRef(ref)) return { ref, from: "profile" };
    }
  }
  return { ref: null, from: null };
}

/**
 * Require real before AND after refs from the request and/or stored profile.
 * Placeholders and a single photo reused as both sides are rejected.
 */
export function resolveCompareImageRefs(input: {
  body?: Record<string, unknown>;
  profile?: Record<string, unknown> | null;
}): { ok: true } & CompareImageRefs | CompareImageRefFailure {
  const before = pickRef(
    input.body,
    input.profile,
    ["before_image_ref", "before_image_url", "before_photo"],
    ["before_image_ref"]
  );
  const after = pickRef(
    input.body,
    input.profile,
    ["after_image_ref", "after_image_url", "after_photo"],
    ["after_image_ref"]
  );

  if (!before.ref || !after.ref) {
    return {
      ok: false,
      error: "image_refs_required",
      message:
        "Compare Me To Me needs real before_image_ref and after_image_ref (request body or stored profile). Placeholder refs are not a visual compare. Save consented photos or pass image URLs, then retry.",
      before_image_ref: before.ref,
      after_image_ref: after.ref
    };
  }

  if (before.ref === after.ref) {
    return {
      ok: false,
      error: "image_refs_required",
      message:
        "before_image_ref and after_image_ref must be two different images. A single photo is not a before/after compare.",
      before_image_ref: before.ref,
      after_image_ref: after.ref
    };
  }

  const source: CompareImageRefs["source"] =
    before.from === "request" && after.from === "request"
      ? "request"
      : before.from === "profile" && after.from === "profile"
        ? "profile"
        : "mixed";

  return {
    ok: true,
    before_image_ref: before.ref,
    after_image_ref: after.ref,
    source
  };
}

function stringList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeCompareVisionText(typeof item === "string" ? item : String(item || "")))
    .filter((item) => item && !looksMedical(item))
    .slice(0, limit);
}

export function parseVisionModelJson(raw: string): CompareVisionAttempt {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return { ok: false, reason: "vision_json_parse_failed" };
    }
    try {
      parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "vision_json_parse_failed" };
    }
  }

  const summary = sanitizeCompareVisionText(String(parsed.summary || ""));
  if (!summary || looksMedical(summary)) {
    return { ok: false, reason: "vision_summary_unusable" };
  }

  return {
    ok: true,
    model: "parsed",
    summary,
    changes: stringList(parsed.changes),
    unchanged: stringList(parsed.unchanged),
    limitations: stringList(parsed.limitations, 6)
  };
}

export function buildHonestCompareActionResult(input: {
  before_image_ref: string;
  after_image_ref: string;
  source: CompareImageRefs["source"];
  vision: CompareVisionAttempt | null;
}): HonestCompareActionResult {
  const visionOk = Boolean(input.vision && input.vision.ok);
  const visionFailReason =
    input.vision && !input.vision.ok ? input.vision.reason : visionOk ? null : "vision_not_attempted";
  const beforeHttps = Boolean(httpsImageUrl(input.before_image_ref));
  const afterHttps = Boolean(httpsImageUrl(input.after_image_ref));

  const summary = visionOk && input.vision && input.vision.ok
    ? input.vision.summary
    : "Compare Me To Me recorded consented before/after image refs. Visual analysis was limited (model unavailable, image URLs not fetchable, or vision did not complete). No appearance score, medical claim, or product was invented.";

  return {
    summary,
    score: {
      mode: visionOk ? "visual_compare" : "refs_recorded_limited",
      live_vision: visionOk,
      vision_limited: !visionOk,
      live_product: false,
      medical_claims: false,
      public_unauthenticated: false
    },
    data: {
      live_vision: visionOk,
      vision_limited: !visionOk,
      vision_fail_reason: visionFailReason,
      live_product: false,
      medical_claims: false,
      generated_product: false,
      image_source: input.source,
      before_https: beforeHttps,
      after_https: afterHttps,
      changes: visionOk && input.vision && input.vision.ok ? input.vision.changes : [],
      unchanged: visionOk && input.vision && input.vision.ok ? input.vision.unchanged : [],
      limitations: visionOk && input.vision && input.vision.ok
        ? input.vision.limitations
        : [
            "Vision did not complete. Image refs are stored on the job. No fake photo scores or ASINs."
          ],
      note: "Honest before/after compare. Not medical advice and not a product recommendation."
    }
  };
}

export function compareVisionConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

export function compareVisionModel(): string {
  return process.env.RMF_COMPARE_VISION_MODEL || "openai/gpt-4o-mini";
}

export const COMPARE_VISION_TIMEOUT_MS = 12_000;

const VISION_SYSTEM = [
  "You compare two photos of the same person for grooming and style appearance only.",
  "Return JSON with keys summary, changes, unchanged, limitations.",
  "changes and unchanged must be string arrays. summary must be one short paragraph.",
  "No medical diagnosis, treatment, disease, or clinical claims.",
  "No product names, ASINs, URLs, or purchase recommendations.",
  "If you cannot see a difference, say so. Do not invent details."
].join(" ");

export async function analyzeCompareImages(
  beforeRef: string,
  afterRef: string,
  timeoutMs = COMPARE_VISION_TIMEOUT_MS
): Promise<CompareVisionAttempt> {
  const beforeUrl = httpsImageUrl(beforeRef);
  const afterUrl = httpsImageUrl(afterRef);
  if (!beforeUrl || !afterUrl) {
    return { ok: false, reason: "image_refs_not_https" };
  }
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    return { ok: false, reason: "vision_gateway_not_configured" };
  }

  const model = compareVisionModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Vercel-AI-App-Name": "Rate My Face Compare"
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: VISION_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Compare the first image (before) to the second image (after). JSON only."
              },
              { type: "image_url", image_url: { url: beforeUrl } },
              { type: "image_url", image_url: { url: afterUrl } }
            ]
          }
        ]
      }),
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, reason: `vision_http_${response.status}` };
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body?.choices?.[0]?.message?.content;
    if (!text) return { ok: false, reason: "vision_empty" };
    const parsed = parseVisionModelJson(text);
    if (parsed.ok) return { ...parsed, model };
    return parsed;
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, reason: "vision_timeout" };
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `vision_error:${message.slice(0, 80)}` };
  } finally {
    clearTimeout(timer);
  }
}
