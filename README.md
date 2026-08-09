# Rate My Face backend

Minimal Next.js backend for the Rate My Face Custom GPT.

## Closure

`GPT image/context -> structured recommendation criteria -> /api/product -> Amazon Creators API -> Amazon-vended affiliate URL -> GPT`

The backend never invents ASINs or rewrites Amazon affiliate URLs. It returns an Amazon Creators API `detailPageURL` only when the URL contains the Associates tag `ratemyface0a-20`.

## Endpoints

- `GET /api/health` — deployment/configuration status without exposing secrets.
- `POST /api/product` — authenticated product search through Amazon Creators API.
- `GET /api/openapi` — dynamic OpenAPI 3.1 schema for the Custom GPT Action.
- `GET /privacy` — public privacy policy for the GPT Action.

## Required Vercel environment variables

Set these for Production (and Preview if desired):

- `AMAZON_CREATORS_CLIENT_ID` — Creators API credential ID.
- `AMAZON_CREATORS_CLIENT_SECRET` — Creators API credential secret.
- `GPT_ACTION_SECRET` — a long random value used as the GPT Action bearer API key.

Do not prefix any secret with `NEXT_PUBLIC_`.

## Amazon integration

This implementation targets the US marketplace (`www.amazon.com`) and the Associates tag `ratemyface0a-20`.

It uses:

- Login with Amazon OAuth client-credentials token endpoint: `https://api.amazon.com/auth/o2/token`
- Creators API SearchItems: `https://creatorsapi.amazon/catalog/v1/searchItems`

The access token is cached in-process until shortly before expiration. On serverless cold starts, a new token may be requested.

## Custom GPT Action

After deployment:

1. Open `/api/openapi` on the production deployment and import/copy that schema into the GPT Action configuration.
2. Configure Action authentication as a Bearer/API key using the same value stored in Vercel as `GPT_ACTION_SECRET`.
3. Set the GPT privacy-policy URL to `/privacy` on the production deployment.
4. In GPT instructions, require the model to call `searchProduct`, use only returned product data, and render `affiliate_url` unchanged.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then test health at `http://localhost:3000/api/health`.
