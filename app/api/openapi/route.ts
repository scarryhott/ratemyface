import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://YOUR_PROJECT.supabase.co";
  const authBase = supabaseUrl.replace(/\/$/, "");

  const schema = {
    openapi: "3.0.1",
    info: {
      title: "Rate My Face Actions API",
      version: "2.0.0",
      description: "OAuth-authenticated Rate My Face Actions for product recommendations and consent-based persistent personalization. User identity is derived from the Supabase OAuth access token, never from a caller-supplied user_id."
    },
    servers: [{ url: origin }],
    security: [{ supabaseOAuth: [] }],
    paths: {
      "/api/product": {
        post: {
          operationId: "searchProduct",
          summary: "Get one safe Amazon recommendation link",
          description: "Search using recommendation criteria. Use only returned product data. If link_type is amazon_search, describe it as Amazon search results rather than a specific verified product.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
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
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Amazon product or tagged Amazon search link",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      link_type: { type: "string", enum: ["product", "amazon_search"] },
                      asin: { type: "string", nullable: true },
                      title: { type: "string", nullable: true },
                      affiliate_url: { type: "string", format: "uri" },
                      image_url: { type: "string", nullable: true },
                      partner_tag: { type: "string" },
                      marketplace: { type: "string" },
                      fallback_reason: { type: "string", nullable: true }
                    }
                  }
                }
              }
            },
            "401": { description: "OAuth sign-in required" }
          }
        }
      },
      "/api/memory/context": {
        get: {
          operationId: "getUserContext",
          summary: "Retrieve the signed-in user's saved Rate My Face context",
          description: "Identity is taken from the Supabase OAuth access token. Never request or supply another user's identifier.",
          responses: {
            "200": {
              description: "Saved context or found=false",
              content: { "application/json": { schema: { type: "object" } } }
            },
            "401": { description: "OAuth sign-in required" },
            "503": { description: "Database is not configured" }
          }
        },
        post: {
          operationId: "saveUserContext",
          summary: "Save personalization context for the signed-in user",
          description: "Persist only compact useful context after explicit personalization consent. Do not send passwords, tokens, payment data, or unnecessary full transcripts.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["consent_personalization", "context"],
                  properties: {
                    consent_personalization: { type: "boolean", enum: [true] },
                    context: {
                      type: "object",
                      additionalProperties: true,
                      description: "Compact structured preferences, product interests, budget, brands, prior choices, and artistic narrative."
                    }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Context saved" },
            "400": { description: "Explicit consent is required" },
            "401": { description: "OAuth sign-in required" },
            "503": { description: "Database is not configured" }
          }
        },
        delete: {
          operationId: "deleteUserContext",
          summary: "Delete all stored Rate My Face data for the signed-in user",
          description: "Deletes only the identity represented by the current OAuth token.",
          responses: {
            "200": { description: "Stored user data deleted" },
            "401": { description: "OAuth sign-in required" },
            "503": { description: "Database is not configured" }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        supabaseOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${authBase}/auth/v1/oauth/authorize`,
              tokenUrl: `${authBase}/auth/v1/oauth/token`,
              scopes: {
                openid: "Identify the signed-in Rate My Face user",
                email: "Read the user's email identity when granted",
                profile: "Read basic profile information when granted"
              }
            }
          }
        }
      }
    }
  };

  return NextResponse.json(schema, { headers: { "Cache-Control": "no-store" } });
}
