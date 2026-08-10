import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { browserHealth, browserObservationProbe } from "../../../lib/browserControl";

export const runtime = "nodejs";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "browser_health",
      {
        title: "Railway Chromium Health",
        description:
          "Read the health of the Railway Chromium runtime used by the project. This tool is read-only and does not navigate, click, type, sign in, or mutate any account.",
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        }
      },
      async () => {
        const health = await browserHealth();
        return {
          content: [{ type: "text", text: JSON.stringify(health) }],
          structuredContent: health as Record<string, unknown>
        };
      }
    );

    server.registerTool(
      "chatgpt_observe_closure",
      {
        title: "Verify ChatGPT Observation Closure",
        description:
          "Observe an allowlisted ChatGPT HTTPS page through Railway Chromium, independently reread it, compare snapshot digests, return a verification receipt, and halt without account mutation. Defaults to https://chatgpt.com/.",
        inputSchema: {
          url: z
            .string()
            .url()
            .optional()
            .describe("Allowlisted ChatGPT HTTPS URL. Defaults to https://chatgpt.com/.")
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        }
      },
      async ({ url }) => {
        const target = url || "https://chatgpt.com/";
        const observed = await browserObservationProbe(target);
        const receipt = {
          skill: "chatgpt-railway-browser-readonly-v1",
          relation: [
            "Vercel",
            "Railway Chromium",
            "ChatGPT observe",
            "independent reread",
            "digest match",
            "receipt",
            "halt"
          ],
          account_mutation: false,
          halted: true,
          verified: Boolean(observed.ok),
          observed
        };
        return {
          content: [{ type: "text", text: JSON.stringify(receipt) }],
          structuredContent: receipt as Record<string, unknown>
        };
      }
    );
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false
  }
);

function authorized(request: Request) {
  const expected = process.env.RMF_CHATGPT_MCP_TOKEN || "";
  if (!expected) return true;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

async function guarded(request: Request) {
  if (!authorized(request)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }
  return mcpHandler(request);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
