import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  const schema = {
    openapi: "3.0.1",
    info: {
      title: "Rate My Face Actions API",
      version: "1.3.0",
      description:
        "Rate My Face product recommendation and consent-based application memory. Product data must come from this API when an action result is used; persistent context must only be saved after explicit user consent."
    },
    servers: [{ url: origin }],
    paths: {
      "/api/product": {
        post: {
          operationId: "searchProduct",
          summary: "Find one Amazon recommendation",
          description:
            "Find one relevant Amazon result from product criteria. If link_type=product, treat the returned ASIN/title/affiliate_url as authoritative. If link_type=amazon_search, describe it only as Amazon search results and do not invent a specific product.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductRequest" }
              }
            }
          },
          responses: {
            "200": {
              description: "Verified Amazon product or tagged Amazon search fallback",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductResponse" }
                }
              }
            },
            "400": {
              description: "Invalid product request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "401": {
              description: "Missing or invalid API key",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        }
      },
      "/api/memory/context": {
        get: {
          operationId: "getUserContext",
          summary: "Get saved Rate My Face context",
          description:
            "Retrieve saved personalization context for the supplied Rate My Face application user identifier.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "user_id",
              in: "query",
              required: true,
              description: "Rate My Face application user identifier for the current user.",
              schema: { type: "string", minLength: 1, maxLength: 128 }
            }
          ],
          responses: {
            "200": {
              description: "Saved context result",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ContextGetResponse" }
                }
              }
            },
            "400": {
              description: "Missing user identifier",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "401": {
              description: "Missing or invalid API key",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "503": {
              description: "Database unavailable",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        },
        post: {
          operationId: "saveUserContext",
          summary: "Save consented personalization context",
          description:
            "Save a compact structured personalization summary only after the user explicitly agrees to persistent Rate My Face memory. Never send passwords, authentication tokens, payment information, or unnecessary full transcripts.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ContextSaveRequest" }
              }
            }
          },
          responses: {
            "200": {
              description: "Context saved",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ContextMutationResponse" }
                }
              }
            },
            "400": {
              description: "Missing user identifier or explicit consent",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "401": {
              description: "Missing or invalid API key",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "503": {
              description: "Database unavailable",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
          }
        },
        delete: {
          operationId: "deleteUserContext",
          summary: "Delete saved Rate My Face data",
          description:
            "Delete stored Rate My Face memory for the supplied current-user identifier when the user asks to delete it.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ContextDeleteRequest" }
              }
            }
          },
          responses: {
            "200": {
              description: "Stored user data deleted",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ContextDeleteResponse" }
                }
              }
            },
            "400": {
              description: "Missing user identifier",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "401": {
              description: "Missing or invalid API key",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            },
            "503": {
              description: "Database unavailable",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" }
                }
              }
            }
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
      },
      schemas: {
        ProductRequest: {
          type: "object",
          additionalProperties: false,
          required: ["product_type"],
          properties: {
            concern: {
              type: "string",
              maxLength: 120,
              description: "Short appearance, grooming, style, skincare, accessory, or practical concern."
            },
            product_type: {
              type: "string",
              minLength: 1,
              maxLength: 120,
              description: "Specific product type to find, such as beard trimmer, moisturizer, sunglasses, or hair clay."
            },
            brand: {
              type: "string",
              maxLength: 80,
              description: "Optional preferred brand."
            },
            budget: {
              type: "string",
              maxLength: 40,
              description: "Optional maximum budget in US dollars, for example '40' or 'under $40'."
            },
            region: {
              type: "string",
              enum: ["US"],
              default: "US",
              description: "Amazon marketplace region."
            }
          }
        },
        ProductResponse: {
          type: "object",
          required: ["ok", "link_type", "affiliate_url", "partner_tag"],
          properties: {
            ok: { type: "boolean" },
            link_type: { type: "string", enum: ["product", "amazon_search"] },
            asin: { type: "string", nullable: true },
            title: { type: "string", nullable: true },
            affiliate_url: { type: "string", format: "uri" },
            image_url: { type: "string", format: "uri", nullable: true },
            price: { type: "string", nullable: true },
            partner_tag: { type: "string", enum: ["ratemyface0a-20"] },
            marketplace: { type: "string" },
            fallback_reason: { type: "string", nullable: true }
          }
        },
        ContextSaveRequest: {
          type: "object",
          additionalProperties: false,
          required: ["user_id", "consent_personalization", "context"],
          properties: {
            user_id: {
              type: "string",
              minLength: 1,
              maxLength: 128,
              description: "Rate My Face application user identifier for the current user."
            },
            consent_personalization: {
              type: "boolean",
              description: "Must be true only after the current user explicitly consents to persistent personalization."
            },
            context: {
              type: "object",
              additionalProperties: true,
              description: "Compact structured context: preferences, budget, brands, prior products, style themes, and artistic narrative."
            }
          }
        },
        ContextDeleteRequest: {
          type: "object",
          additionalProperties: false,
          required: ["user_id"],
          properties: {
            user_id: {
              type: "string",
              minLength: 1,
              maxLength: 128
            }
          }
        },
        ContextGetResponse: {
          type: "object",
          required: ["ok", "found", "user_id"],
          properties: {
            ok: { type: "boolean" },
            found: { type: "boolean" },
            user_id: { type: "string" },
            consent_personalization: { type: "boolean", nullable: true },
            consent_history: { type: "boolean", nullable: true },
            context: { type: "object", nullable: true, additionalProperties: true },
            updated_at: { type: "string", nullable: true }
          }
        },
        ContextMutationResponse: {
          type: "object",
          required: ["ok", "user_id"],
          properties: {
            ok: { type: "boolean" },
            user_id: { type: "string" }
          }
        },
        ContextDeleteResponse: {
          type: "object",
          required: ["ok", "deleted", "user_id"],
          properties: {
            ok: { type: "boolean" },
            deleted: { type: "boolean" },
            user_id: { type: "string" }
          }
        },
        ErrorResponse: {
          type: "object",
          required: ["ok", "error"],
          properties: {
            ok: { type: "boolean" },
            error: { type: "string" },
            message: { type: "string", nullable: true }
          }
        }
      }
    }
  };

  return NextResponse.json(schema, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
