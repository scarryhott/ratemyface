import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const error = {
    type: "object",
    required: ["ok", "error"],
    properties: { ok: { type: "boolean" }, error: { type: "string" }, message: { type: "string" } }
  };

  const schema = {
    openapi: "3.1.0",
    info: {
      title: "Rate My Face Actions API",
      version: "2.5.3",
      description:
        "FREE product links + credit-metered account learning. Preference/memory questions → MUST call getPersonalNetwork before answering (then getUserContext if empty). Never answer prefs from chat/Memory/web. Remember/consent → MUST write Actions. Dual-write syncs stores. On 402 use checkout."
    },
    servers: [{ url: origin }],
    security: [{ rateMyFaceOAuth: [] }],
    paths: {
      "/api/product": {
        post: {
          operationId: "searchProduct",
          summary: "FREE — get one Amazon recommendation link",
          description: "FREE affiliate/product acquisition. Call for product recommendations. Not used for account learning.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ProductRequest" } } }
          },
          responses: {
            "200": {
              description: "Amazon result",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ProductResponse" } } }
            }
          }
        }
      },
      "/api/billing/entitlements": {
        get: {
          operationId: "getEntitlements",
          summary: "PAYMENT-INFRASTRUCTURE — get plan, entitlements, and credit balance",
          description:
            "Returns plan (free|premium), credit balance, pack size, signup_bootstrap_credits, metered costs, and whether premium subscription checkout is configured. Call before paid Actions when balance/access is uncertain. Do not invent premium access.",
          responses: { "200": { description: "Access, plan, and balance" } }
        }
      },
      "/api/billing/credits/checkout": {
        post: {
          operationId: "createCreditCheckoutSession",
          summary: "PAYMENT-INFRASTRUCTURE — buy 100 Rate My Face credits",
          description:
            "Stripe-hosted one-time checkout for a credit pack. Credits are granted only after verified webhook — never after redirect alone. Use when a paid Action returned credits_required and the user wants to buy credits.",
          responses: {
            "200": { description: "Checkout URL" },
            "503": { description: "Stripe not configured" }
          }
        }
      },
      "/api/personal": {
        get: {
          operationId: "getPersonalNetwork",
          summary: "REQUIRED for preference questions — fetch saved Rate My Face prefs (1; report 5)",
          description:
            "Call FIRST when user asks preferences/memory/what you know about them. mode=profile. Do not answer from chat, Memory, or web. If found=false/empty also call getUserContext. Natural language is enough. Costs 1 (report=5). On 402 do not invent prefs.",
          parameters: [
            {
              name: "mode",
              in: "query",
              schema: { type: "string", enum: ["profile", "history", "saved", "connections", "report"], default: "profile" }
            },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } }
          ],
          responses: {
            "200": { description: "Persistent personal network data" },
            "402": {
              description: "Credits required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/CreditsRequiredResponse" } } }
            }
          }
        },
        post: {
          operationId: "updatePersonalNetwork",
          summary: "PAID/METERED — MUST call on explicit remember/consent (1 credit)",
          description:
            "MUST call on explicit remember/save/store. Prefer operation=update_profile with minimal profile incl. consent_personalization=true. Dual-writes legacy context. Ordinary chat is not storage — claim success only after Action succeeds. Costs 1. On 402 do not claim saved.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PersonalWriteRequest" } } }
          },
          responses: {
            "200": { description: "Saved persistent state" },
            "402": {
              description: "Credits required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/CreditsRequiredResponse" } } }
            }
          }
        }
      },
      "/api/memory/context": {
        get: {
          operationId: "getUserContext",
          summary: "PAID/METERED — call if getPersonalNetwork found=false/empty (1)",
          description:
            "Legacy/mirror preference read. After getPersonalNetwork mode=profile returns found=false/empty/null, MUST call this same turn. Falls back to personal profile when legacy empty. Answer only from returned data. Costs 1 credit.",
          responses: {
            "200": { description: "Context" },
            "402": {
              description: "Credits required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/CreditsRequiredResponse" } } }
            }
          }
        },
        post: {
          operationId: "saveUserContext",
          summary: "PAID/METERED — legacy remember/consent write; mirrors profile (1)",
          description:
            "Legacy write for explicit remember/consent. Requires consent_personalization=true. Prefer updatePersonalNetwork update_profile; if used, dual-writes Personal Network profile. Costs 1. On 402 do not claim saved.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SaveUserContextRequest" } } }
          },
          responses: {
            "200": { description: "Saved" },
            "402": {
              description: "Credits required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/CreditsRequiredResponse" } } }
            }
          }
        },
        delete: {
          operationId: "deleteUserContext",
          summary: "ACCOUNT/SECURITY — delete stored Rate My Face context",
          description: "Never paywalled. Deletes legacy context and Personal Network profile for the authenticated user.",
          responses: { "200": { description: "Deleted" } }
        }
      }
    },
    components: {
      schemas: {
        ProductRequest: {
          type: "object",
          additionalProperties: false,
          required: ["product_type"],
          properties: {
            concern: { type: "string", maxLength: 120 },
            product_type: { type: "string", maxLength: 120 },
            brand: { type: "string", maxLength: 80 },
            budget: { type: "string", maxLength: 40 },
            region: { type: "string", enum: ["US"] }
          }
        },
        ProductResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            link_type: { type: "string" },
            asin: { type: ["string", "null"] },
            title: { type: ["string", "null"] },
            affiliate_url: { type: "string", format: "uri" },
            partner_tag: { type: "string" },
            marketplace: { type: "string" }
          }
        },
        SaveUserContextRequest: {
          type: "object",
          required: ["consent_personalization", "context"],
          properties: {
            consent_personalization: {
              type: "boolean",
              const: true,
              description: "Must be true. Explicit user consent to store personalization on their Rate My Face account."
            },
            context: {
              type: "object",
              additionalProperties: true,
              properties: {},
              description: "Minimal structured preferences/context to persist. Ordinary chat text is not enough without this Action."
            }
          }
        },
        PersonalWriteRequest: {
          type: "object",
          required: ["operation"],
          properties: {
            operation: {
              type: "string",
              enum: ["update_profile", "save_interaction", "save_recommendation", "recommendation_feedback"],
              description: "Use update_profile for explicit remember/consent preference statements."
            },
            profile: {
              type: "object",
              additionalProperties: true,
              properties: {},
              description:
                "For update_profile: minimal structured prefs, e.g. { preferences: {...}, consent_personalization: true }."
            },
            kind: { type: "string", maxLength: 80 },
            summary: { type: "string", maxLength: 1000 },
            data: { type: "object", additionalProperties: true, properties: {} },
            item_type: { type: "string", maxLength: 80 },
            title: { type: "string", maxLength: 300 },
            url: { type: "string", format: "uri" },
            recommendation_id: { type: "integer" },
            feedback: { type: "string", maxLength: 200 }
          }
        },
        CreditsRequiredResponse: {
          type: "object",
          required: ["ok", "error", "required_credits", "balance", "checkout_action"],
          properties: {
            ok: { type: "boolean", const: false },
            error: { type: "string", const: "credits_required" },
            message: {
              type: "string",
              description: "Human-readable notice that persistence needs Rate My Face credits."
            },
            required_credits: { type: "integer" },
            balance: { type: "integer" },
            checkout_action: { type: "string", const: "createCreditCheckoutSession" }
          }
        },
        ErrorResponse: error
      },
      securitySchemes: {
        rateMyFaceOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${origin}/oauth/authorize`,
              tokenUrl: `${origin}/oauth/token`,
              scopes: {
                profile: "Use the signed-in Rate My Face account for personalization and billing"
              }
            }
          }
        }
      }
    }
  };

  return NextResponse.json(schema, { headers: { "Cache-Control": "no-store" } });
}
