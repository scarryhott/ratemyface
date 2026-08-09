import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const schema = {
    openapi: "3.1.0",
    info: {
      title: "Rate My Face Product API",
      version: "1.0.0",
      description: "Returns one Amazon Creators API-verified product and its Amazon-vended affiliate URL."
    },
    servers: [{ url: origin }],
    paths: {
      "/api/product": {
        post: {
          operationId: "searchProduct",
          summary: "Find one verified Amazon product",
          description: "Search Amazon using recommendation criteria. Use only returned product data and return affiliate_url unchanged.",
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
              description: "Verified product",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["ok", "asin", "affiliate_url", "partner_tag"],
                    properties: {
                      ok: { type: "boolean" },
                      asin: { type: "string" },
                      title: { type: ["string", "null"] },
                      affiliate_url: { type: "string", format: "uri" },
                      image_url: { type: ["string", "null"] },
                      price: {},
                      partner_tag: { type: "string" },
                      marketplace: { type: "string" }
                    }
                  }
                }
              }
            },
            "400": { description: "Invalid or unsupported recommendation request" },
            "401": { description: "Missing or invalid action API key" },
            "404": { description: "No validated Amazon product found" },
            "502": { description: "Amazon search request failed" },
            "503": { description: "Backend is not configured" }
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
