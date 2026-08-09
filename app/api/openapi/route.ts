import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const schema = {
    openapi: "3.1.0",
    info: {
      title: "Rate My Face Product API",
      version: "1.1.0",
      description: "Returns either an Amazon Creators API-vended product link or a tagged Amazon search link without inventing an ASIN."
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
