# Authenticated Browser Harness

This is the browser-control extension of the Builder Operator. It is designed for services such as the ChatGPT GPT Builder where an owner-authenticated web UI may expose capabilities that are not available through a management API.

## Credential boundary

The owner authenticates interactively in the browser profile. The model/operator never receives, exports, stores, logs, or commits passwords, recovery codes, OAuth tokens, session cookies, local-storage tokens, or raw browser-profile data.

`owner login -> authenticated browser profile -> bounded browser actions -> observed return -> independent reread -> receipt`

The authenticated browser profile is the credential boundary.

## Capability ladder

- L2 `browser_session_attach`: attach to an explicitly configured browser-control endpoint/profile.
- L2 `browser_observe`: navigate/read approved pages without account mutation.
- L2 `browser_form_draft`: fill/draft but do not submit account-changing forms.
- L3 `browser_account_mutation`: submit bounded reversible account changes.
- L3 `browser_publish_gpt`: publish/update a GPT only after intended configuration and reread verification agree.
- L5 `browser_payment`: economic action; separate approval and spend ceiling required.
- L6 `browser_permission_expansion`: scopes, account permissions, credential expansion, security settings.

Only the first two L2 capabilities are specified initially. Later stages remain potential additions until L2 is proven, documented, and reintegrated.

## Runtime contract

The Vercel control plane does not itself contain a persistent desktop browser. A browser runtime must expose a narrow authenticated control endpoint to the operator. The runtime may be a dedicated agent browser or an explicitly owner-approved existing-session attachment.

Required environment configuration:

- `RMF_BROWSER_CONTROL_URL` — HTTPS control endpoint for the browser harness.
- `RMF_BROWSER_CONTROL_TOKEN` — bearer credential stored only in Vercel/provider secret storage.
- `RMF_BROWSER_ALLOWED_HOSTS` — comma-separated allowlist; start with `chatgpt.com`.

The control endpoint must support bounded commands rather than arbitrary shell access. Initial contract:

`GET /health` -> `{ ok, runtime, session_attached, current_url? }`

`POST /observe` with `{ url }` -> `{ ok, final_url, title, text, snapshot_digest }`

The runtime must reject navigation outside `RMF_BROWSER_ALLOWED_HOSTS` and must redact credential-like fields before returning observations.

## ChatGPT first probe

The first ChatGPT browser proof is read-only:

1. owner signs into ChatGPT interactively in the browser profile;
2. operator attaches at L2;
3. navigate to an approved ChatGPT page;
4. observe non-secret page state;
5. independently repeat the observation;
6. compare stable state/digest evidence;
7. persist a receipt;
8. halt without editing, publishing, deleting, purchasing, changing settings, or expanding permissions.

Passing this probe proves authenticated browser observation, not GPT mutation authority.

## Closure invariant

`admit(browser_mutation) -> verified(browser_observe) ∧ documented(browser_observe) ∧ reintegrated(browser_observe) ∧ owner_authorized(browser_mutation)`

A click or successful HTTP response alone is never closure. Mutations must later be verified by independent reread of the resulting account state.
