import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  const schema = {
    openapi: "3.1.0",
    info: {
      title: "Rate My Face Actions API",
      version: "2.1.0",
      description: "OAuth-authenticated Rate My Face Actions for product recommendations and consent-based persistent personalization. ChatGPT authenticates against the Rate My Face OAuth bridge; Supabase remains the underlying user identity provider."
    },
    servers: [{ url: origin }],
    security: [{ rateMyFaceOAuth: [] }],
    paths: {
      "/api/product": {
        post: {
          operationId: "searchProduct",
          summary: "Get one safe Amazon recommendation link",
          description: "Search using recommendation criteria. Use only returned product data. If link_type is amazon_search, describe it as Amazon search results rather than a specific verified product.",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProductRequest" } } } },
          responses: {
            "200": { description: "Amazon product or tagged Amazon search link", content: { "application/json": { schema: { $ref: "#/components/schemas/ProductResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        }
      },
      "/api/memory/context": {
        get: {
          operationId: "getUserContext",
          summary: "Retrieve the signed-in user's saved Rate My Face context",
          description: "Identity is taken from the Rate My Face OAuth access token. Never request or supply another user's identifier.",
          responses: {
            "200": { description: "Saved context or found=false", content: { "application/json": { schema: { $ref: "#/components/schemas/UserContextResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "503": { description: "Database is not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        },
        post: {
          operationId: "saveUserContext",
          summary: "Save personalization context for the signed-in user",
          description: "Persist only compact useful context after explicit personalization consent. Do not send passwords, tokens, payment data, or unnecessary full transcripts.",
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SaveUserContextRequest" } } } },
          responses: {
            "200": { description: "Context saved", content: { "application/json": { schema: { $ref: "#/components/schemas/MutationResponse" } } } },
            "400": { description: "Explicit consent is required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "401": { description: "OAuth sign-in required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "503": { description: "Database is not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } }
          }
        },
        delete: {
          operationId: "deleteUserContext",
          summary: "Delete all stored Rate My Face data for the signed-in user",
          description: "Deletes only the identity represented by the current OAuth token.",
          responses: {
            "200": { description: "Stored user data deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/MutationResponse" } } } },
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
                profile: "Use the signed-in Rate My Face account for personalization"
              }
            }
          }
        }
      }
    }
  };

  return NextResponse.json(schema, { headers: { "Cache-Control": "no-store" } });
}
