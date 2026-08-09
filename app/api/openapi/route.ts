import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const schema = {
    openapi: "3.1.0",
    info: {
      title: "Rate My Face Actions API",
      version: "1.2.0",
      description: "Product recommendation plus consent-based Rate My Face application memory. Product links are backend-verified; persistent context is stored only after explicit personalization consent."
    },
    servers: [{ url: origin }],
    paths: {
      "/api/product": {
        post: {
          operationId: "searchProduct",
          summary: "Get one safe Amazon recommendation link",
          description: "Search Amazon using recommendation criteria. If link_type is product, use only returned product data and render affiliate_url unchanged. If link_type is amazon_search, do not claim a specific product or ASIN; describe it as Amazon results for the recommendation.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["product_type"],
                  properties: {
                    concern: { type: "string", description: "Short aesthetic or practical concern relevant to the product." },
                    product_type: { type: "string", description: "Specific product type to search for." },
                    brand: { type: "string", description: "Optional preferred brand." },
                    budget: { oneOf: [{ type: "number" }, { type: "string" }], description: "Optional maximum budget in US dollars." },
                    region: { type: "string", enum: ["US"], description: "Amazon marketplace region." }
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
                    required: ["ok", "link_type", "affiliate_url", "partner_tag"],
                    properties: {
                      ok: { type: "boolean" },
                      link_type: { type: "string", enum: ["product", "amazon_search"] },
                      asin: { type: ["string", "null"] },
                      title: { type: ["string", "null"] },
                      affiliate_url: { type: "string", format: "uri" },
                      image_url: { type: ["string", "null"] },
                      price: {},
                      partner_tag: { type: "string" },
                      marketplace: { type: "string" },
                      fallback_reason: { type: "string" }
                    }
                  }
                }
              }
            },
            "400": { description: "Invalid or unsupported recommendation request" },
            "401": { description: "Missing or invalid action API key" }
          }
        }
      },
      "/api/memory/context": {
        get: {
          operationId: "getUserContext",
          summary: "Retrieve saved Rate My Face context",
          description: "Retrieve the user's previously stored Rate My Face personalization context. Use only for a user identifier associated with the current user. Do not infer consent from the existence of this endpoint.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "user_id",
              in: "query",
              required: true,
              schema: { type: "string", maxLength: 128 },
              description: "Rate My Face application user identifier."
            }
          ],
          responses: {
            "200": { description: "Saved context or found=false" },
            "400": { description: "Missing user identifier" },
            "401": { description: "Missing or invalid action API key" },
            "503": { description: "Database is not configured" }
          }
        },
        post: {
          operationId: "saveUserContext",
          summary: "Save consented Rate My Face personalization context",
          description: "Persist a compact structured summary of useful Rate My Face preferences/context only when the current user explicitly consents to persistent personalization. Do not send unnecessary full transcripts, passwords, authentication tokens, payment data, or other secrets.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["user_id", "consent_personalization", "context"],
                  properties: {
                    user_id: { type: "string", maxLength: 128, description: "Rate My Face application user identifier." },
                    consent_personalization: { type: "boolean", enum: [true], description: "Must be true only after explicit user consent to persistent personalization." },
                    context: {
                      type: "object",
                      additionalProperties: true,
                      description: "Compact structured context such as style preferences, product interests, budget, brands, prior choices, and artistic narrative."
                    }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Context saved" },
            "400": { description: "Missing user identifier or consent" },
            "401": { description: "Missing or invalid action API key" },
            "503": { description: "Database is not configured" }
          }
        },
        delete: {
          operationId: "deleteUserContext",
          summary: "Delete Rate My Face stored user data",
          description: "Delete the Rate My Face application memory associated with the supplied current-user identifier when the user requests deletion.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["user_id"],
                  properties: {
                    user_id: { type: "string", maxLength: 128, description: "Rate My Face application user identifier." }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Stored Rate My Face user data deleted" },
            "400": { description: "Missing user identifier" },
            "401": { description: "Missing or invalid action API key" },
            "503": { description: "Database is not configured" }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer"
        }
      }
    }
  };

  return NextResponse.json(schema, {
    headers: { "Cache-Control": "public, max-age=300" }
  });
}
