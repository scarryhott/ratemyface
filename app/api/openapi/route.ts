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
      version: "2.5.5",
      description:
        "FREE product links + credit-metered account learning and Compare Me To Me. Preference/memory questions → MUST call getPersonalNetwork before answering (then getUserContext if empty). Never answer prefs from chat/Memory/web. Remember/consent → MUST write Actions. Dual-write syncs stores. On 402 MUST call createCreditCheckoutSession same turn."
    },
    servers: [{ url: origin }],
    security: [{ rateMyFaceOAuth: [] }],
    paths: {
      "/api/product": {
        post: {
          operationId: "searchProduct",
          summary: "FREE — get one Amazon recommendation link",
          description:
            "MUST call for every product or recommendation ask. FREE. Always paste returned affiliate_url unchanged as (paid link). Never invent ASIN, URL, price, or product identity. Not used for account learning.",
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
            "MUST call when the user asks credit balance, or before paid Actions if balance is uncertain. Returns credits, pack size (100), and metered costs. If credits are 0 or below next metered cost, JSON includes checkout_action=createCreditCheckoutSession — then MUST call that Action the same turn.",
          responses: { "200": { description: "Plan, credits, pack size; checkout_action when balance cannot cover next metered cost" } }
        }
      },
      "/api/billing/credits/checkout": {
        post: {
          operationId: "createCreditCheckoutSession",
          summary: "PAYMENT-INFRASTRUCTURE — buy 100 Rate My Face credits",
          description:
            "MUST call in the SAME turn on HTTP 402 / credits_required, or when the user asks to buy Rate My Face credits. Stripe-hosted pack of 100. Paste checkout URL unchanged. Never collect cards. Credits apply after verified webhook, not after redirect.",
          responses: {
            "200": { description: "Stripe-hosted checkout URL — paste unchanged; credits apply after webhook" },
            "503": { description: "Stripe not configured" }
          }
        }
      },
      "/api/personal": {
        get: {
          operationId: "getPersonalNetwork",
          summary: "REQUIRED for preference questions — fetch saved Rate My Face prefs (1; report 5)",
          description:
            "Call FIRST when user asks preferences/memory/what you know about them. mode=profile. Do not answer from chat, Memory, or web. If found=false/empty also call getUserContext. Natural language is enough. Costs 1 (report=5). On 402 do not invent prefs; MUST call createCreditCheckoutSession same turn.",
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
            "MUST call on explicit remember/save/store. Prefer operation=update_profile with minimal profile incl. consent_personalization=true. Dual-writes legacy context. Server also records rmf_interactions and derives rmf_personal_recommendations when url/title is present. Ordinary chat is not storage — claim success only after Action succeeds. Costs 1. On 402 do not claim saved; MUST call createCreditCheckoutSession same turn.",
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
            "Legacy/mirror preference read. After getPersonalNetwork mode=profile returns found=false/empty/null, MUST call this same turn. Falls back to personal profile when legacy empty. Answer only from returned data. Costs 1 credit. On 402 MUST call createCreditCheckoutSession same turn.",
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
            "Legacy write for explicit remember/consent. Requires consent_personalization=true. Prefer updatePersonalNetwork update_profile; if used, dual-writes Personal Network profile. Costs 1. On 402 do not claim saved; MUST call createCreditCheckoutSession same turn.",
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
      },
      "/api/compare": {
        post: {
          operationId: "compareMeToMe",
          summary: "PAID/METERED — Compare Me To Me before/after (1 credit)",
          description:
            "PAID — Compare Me To Me. OAuth, consent_compare=true, and real before/after image refs required. Costs 1 credit (same unit as Personal Network). Missing refs return 400, never fake analysis. On 402 MUST call createCreditCheckoutSession same turn. No medical claims or invented ASINs.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CompareRequest" } } }
          },
          responses: {
            "200": { description: "Persisted compare job + honest result" },
            "400": { description: "Missing consent_compare or real before/after image refs" },
            "401": { description: "OAuth required — not a free anonymous compare" },
            "402": {
              description: "Credits required",
              content: { "application/json": { schema: { $ref: "#/components/schemas/CreditsRequiredResponse" } } }
            }
          }
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
        CompareRequest: {
          type: "object",
          additionalProperties: false,
          required: ["consent_compare"],
          properties: {
            consent_compare: {
              type: "boolean",
              const: true,
              description: "Must be true. Explicit consent to run Compare Me To Me on before/after images."
            },
            consent_image_storage: {
              type: "boolean",
              description: "Optional. True if the user consents to retain image refs on the compare job."
            },
            before_image_ref: {
              type: "string",
              maxLength: 2000,
              description: "Before image HTTPS URL or stored ref. Required unless already on the user's profile."
            },
            after_image_ref: {
              type: "string",
              maxLength: 2000,
              description: "After image HTTPS URL or stored ref. Required unless already on the user's profile."
            }
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
