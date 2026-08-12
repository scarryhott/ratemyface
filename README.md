# Rate My Face backend

Minimal Next.js backend for the Rate My Face Custom GPT.

## Closure

`GPT image/context -> structured recommendation criteria -> /api/product -> Amazon -> tagged affiliate URL -> GPT`

The backend never invents ASINs.

- When Amazon Creators API is configured and returns a valid product, the backend returns Amazon's own vended `detailPageURL` containing `ratemyface0a-20`.
- When Creators API is unavailable or not yet configured, the backend returns a tagged Amazon search-results link instead of fabricating a product ASIN.

## Endpoints

- `GET /api/health` — deployment/configuration status without exposing secrets.
- `POST /api/product` — authenticated recommendation-link endpoint.
- `GET /api/openapi` — dynamic OpenAPI 3.1 schema for the Custom GPT Action.
- `GET /privacy` — public privacy policy for the GPT Action.
- `GET /api/providers` — social provider connection catalog (OAuth skeleton; see `SOCIAL_PROVIDERS.md`).
- `POST /api/providers/connect` — returns `501 not_configured` until provider credentials exist.
- `POST /api/providers/disconnect` — revoke stub / soft-revoke when a row exists.

## Social providers (OAuth skeleton)

Planned: Instagram, LinkedIn, TikTok — **user-authorized OAuth only**. No scraping. No live connect until secrets are configured. Details: [`SOCIAL_PROVIDERS.md`](./SOCIAL_PROVIDERS.md).

## Required Vercel environment variable

Set for Production:

- `GPT_ACTION_SECRET` — a long random value used as the GPT Action bearer API key.

Optional, for exact product resolution through Amazon Creators API:

- `AMAZON_CREATORS_CLIENT_ID`
- `AMAZON_CREATORS_CLIENT_SECRET`

Do not prefix any secret with `NEXT_PUBLIC_`.

## Amazon integration

This implementation targets the US marketplace (`www.amazon.com`) and Associates tag `ratemyface0a-20`.

With Creators API credentials it uses:

- Login with Amazon OAuth client-credentials token endpoint: `https://api.amazon.com/auth/o2/token`
- Creators API SearchItems: `https://creatorsapi.amazon/catalog/v1/searchItems`

The access token is cached in-process until shortly before expiration. On serverless cold starts, a new token may be requested.

Without Creators API access, `/api/product` still returns a correctly tagged Amazon search URL and reports `link_type: amazon_search`. The Custom GPT must not claim a specific ASIN in that mode.

## Custom GPT Action

After deployment:

1. Open `/api/openapi` on the production deployment and import/copy that schema into the GPT Action configuration.
2. Configure Action authentication as a Bearer/API key using the same value stored in Vercel as `GPT_ACTION_SECRET`.
3. Set the GPT privacy-policy URL to `/privacy` on the production deployment.
4. Paste `GPT_INSTRUCTIONS.md` into the Custom GPT Instructions editor (keep ≤7900 chars). The file leads with a MUST retrieve block so preference questions auto-call `getPersonalNetwork`.
5. Require the GPT to call `searchProduct` and render `affiliate_url` unchanged.
6. If `link_type` is `product`, it may use the returned title/ASIN. If `link_type` is `amazon_search`, describe the link only as Amazon results for the recommendation.

### Conversation starters (paste in GPT editor)

Exact starter text that helps Action selection for Account Learning:

1. `What do you know about my preferences?`
2. `Remember that I prefer a natural professional look and short beard`
3. `How many Rate My Face credits do I have?`
4. `Recommend a product for my look`

Monitor check: a **new chat** with starter (1) should show Allow/consent for `getPersonalNetwork` without the user saying “Call getPersonalNetwork”.

## Deployment

The repository is structured as a standard Next.js App Router project. If the Vercel project is linked to this GitHub repository, pushes to `main` trigger Vercel deployments automatically.

A GitHub Actions workflow also runs `npm install` and `npm run build` on pushes and pull requests.
