import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  const schema = {
    openapi: "3.1.0",
    info: {
      title: "Rate My Face Actions API",
      version: "2.2.1",
      description: "OAuth-authenticated Rate My Face Actions. Product recommendation is free; payment infrastructure discovers/creates access; persistent database-backed memory is premium and enforced server-side."
    },
    servers: [{ url: origin }],
    security: [{ rateMyFaceOAuth: [] }],
    paths: {
      "/api/product": {
        post: {
          operationId: "searchProduct",
          summary: "FREE — get one Amazon recommendation link",
          description: "Search using recommendation criteria. Use only returned product data. If link_type is amazon_search, describe it as Amazon search results rather than a specific verified product.",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProductRequest" } } } },
          responses: {
            "200": { description: "Amazon product or tagged Amazon search link", content: { "application/json": { schema: { $ref: "#/components/schemas/ProductResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        }
      },
      "/api/billing/entitlements": {
        get: {
          operationId: "getEntitlements",
          summary: "PAYMENT-INFRASTRUCTURE — check the signed-in user's access",
          description: "Call this before premium Actions when access is uncertain. This operation is not itself paywalled.",
          responses: {
            "200": { description: "Current plan and active entitlements", content: { "application/json": { schema: { $ref: "#/components/schemas/EntitlementResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "503": { description: "Database is not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        }
      },
      "/api/billing/checkout": {
        post: {
          operationId: "createCheckoutSession",
          summary: "PAYMENT-INFRASTRUCTURE — create a Stripe-hosted premium checkout",
          description: "Create a hosted Stripe Checkout Session for the signed-in Rate My Face account. Never collect card data in chat. Return the checkout_url to the user unchanged. Do not create another subscription if the account is already premium.",
          responses: {
            "200": { description: "Stripe-hosted checkout URL", content: { "application/json": { schema: { $ref: "#/components/schemas/CheckoutResponse" } } } },
            "409": { description: "Account is already premium; use billing portal instead", content: { "application/json": { schema: { $ref: "#/components/schemas/AlreadyPremiumResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "503": { description: "Database, Stripe secret, or premium price is not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        }
      },
      "/api/billing/portal": {
        post: {
          operationId: "createBillingPortalSession",
          summary: "PAYMENT-INFRASTRUCTURE — manage an existing Stripe subscription",
          description: "Create a short-lived Stripe-hosted billing portal URL for the signed-in user's existing billing account.",
          responses: {
            "200": { description: "Stripe billing portal URL", content: { "application/json": { schema: { $ref: "#/components/schemas/PortalResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "404": { description: "No billing account exists yet", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "503": { description: "Database or Stripe is not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        }
      },
      "/api/memory/context": {
        get: {
          operationId: "getUserContext",
          summary: "PAID — retrieve persistent Rate My Face context",
          description: "Premium database-backed memory for the signed-in user. If upgrade_required is returned, call createCheckoutSession only when the user wants the premium feature.",
          responses: {
            "200": { description: "Saved context or found=false", content: { "application/json": { schema: { $ref: "#/components/schemas/UserContextResponse" } } } },
            "402": { description: "Premium entitlement required", content: { "application/json": { schema: { $ref: "#/components/schemas/UpgradeRequiredResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "503": { description: "Database is not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        },
        post: {
          operationId: "saveUserContext",
          summary: "PAID — save persistent Rate My Face personalization context",
          description: "Premium database-backed memory. Persist only compact useful context after explicit personalization consent. Do not send passwords, tokens, payment data, or unnecessary full transcripts.",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SaveUserContextRequest" } } } },
          responses: {
            "200": { description: "Context saved", content: { "application/json": { schema: { $ref: "#/components/schemas/MutationResponse" } } } },
            "402": { description: "Premium entitlement required", content: { "application/json": { schema: { $ref: "#/components/schemas/UpgradeRequiredResponse" } } } },
            "400": { description: "Explicit consent is required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "503": { description: "Database is not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        },
        delete: {
          operationId: "deleteUserContext",
          summary: "ACCOUNT/SECURITY — delete stored personalization context/history",
          description: "Deletes the signed-in user's Rate My Face personalization/history records. This operation is never paywalled. Billing records may be retained separately as required for subscription/account administration.",
          responses: {
            "200": { description: "Stored personalization/history deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/MutationResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "503": { description: "Database is not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        }
      }
    },
    components: {
      schemas: {
        ProductRequest: { type: "object", additionalProperties: false, required: ["product_type"], properties: { concern: { type: "string", maxLength: 120 }, product_type: { type: "string", maxLength: 120 }, brand: { type: "string", maxLength: 80 }, budget: { type: "string", maxLength: 40 }, region: { type: "string", enum: ["US"] } } },
        ProductResponse: { type: "object", required: ["ok", "link_type", "affiliate_url", "partner_tag", "marketplace"], properties: { ok: { type: "boolean" }, link_type: { type: "string", enum: ["product", "amazon_search"] }, asin: { type: ["string", "null"] }, title: { type: ["string", "null"] }, affiliate_url: { type: "string", format: "uri" }, image_url: { type: ["string", "null"] }, price: {}, partner_tag: { type: "string" }, marketplace: { type: "string" }, fallback_reason: { type: ["string", "null"] } } },
        SaveUserContextRequest: { type: "object", additionalProperties: false, required: ["consent_personalization", "context"], properties: { consent_personalization: { type: "boolean", const: true }, context: { type: "object", additionalProperties: true, properties: {}, description: "Compact structured preferences, product interests, budget, brands, prior choices, and artistic narrative." } } },
        UserContextResponse: { type: "object", required: ["ok", "found"], properties: { ok: { type: "boolean" }, found: { type: "boolean" }, consent_personalization: { type: ["boolean", "null"] }, consent_history: { type: ["boolean", "null"] }, context: { type: ["object", "null"], additionalProperties: true, properties: {} }, updated_at: { type: ["string", "null"], format: "date-time" } } },
        EntitlementResponse: { type: "object", required: ["ok", "plan", "premium", "features"], properties: { ok: { type: "boolean" }, plan: { type: "string", enum: ["free", "premium"] }, premium: { type: "boolean" }, features: { type: "array", items: { type: "string" } }, subscription_status: { type: ["string", "null"] }, current_period_end: { type: ["string", "null"], format: "date-time" } } },
        CheckoutResponse: { type: "object", required: ["ok", "checkout_url", "session_id", "plan"], properties: { ok: { type: "boolean" }, checkout_url: { type: "string", format: "uri" }, session_id: { type: "string" }, plan: { type: "string", enum: ["premium"] } } },
        PortalResponse: { type: "object", required: ["ok", "portal_url"], properties: { ok: { type: "boolean" }, portal_url: { type: "string", format: "uri" } } },
        UpgradeRequiredResponse: { type: "object", required: ["ok", "error", "required_entitlement", "checkout_action"], properties: { ok: { type: "boolean", const: false }, error: { type: "string", const: "upgrade_required" }, message: { type: "string" }, required_entitlement: { type: "string", const: "premium" }, checkout_action: { type: "string", const: "createCheckoutSession" } } },
        AlreadyPremiumResponse: { type: "object", required: ["ok", "error", "portal_action"], properties: { ok: { type: "boolean", const: false }, error: { type: "string", const: "already_premium" }, message: { type: "string" }, portal_action: { type: "string", const: "createBillingPortalSession" } } },
        MutationResponse: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" }, saved: { type: "boolean" }, deleted: { type: "boolean" } } },
        ErrorResponse: { type: "object", required: ["ok", "error"], properties: { ok: { type: "boolean" }, error: { type: "string" }, message: { type: "string" } } }
      },
      securitySchemes: {
        rateMyFaceOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${origin}/oauth/authorize`,
              tokenUrl: `${origin}/oauth/token`,
              scopes: {
                profile: "Use the signed-in Rate My Face account for personalization and billing entitlements"
              }
            }
          }
        }
      }
    }
  };

  return NextResponse.json(schema, { headers: { "Cache-Control": "no-store" } });
}
