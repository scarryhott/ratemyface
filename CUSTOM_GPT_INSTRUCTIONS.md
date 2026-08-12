# Rate My Face Custom GPT instructions (short pointer)

**Canonical source of truth:** `GPT_INSTRUCTIONS.md` — paste that full file into the Custom GPT Instructions editor after deploy.

Hard rules that must not drift:
1. Ordinary chat ≠ Rate My Face storage. ChatGPT Memory does not satisfy account learning.
2. Explicit remember/consent (“Remember that I prefer…”) → call `updatePersonalNetwork` (`operation=update_profile`) and/or `saveUserContext` with `consent_personalization=true` in the same turn.
3. Preference questions (“What do you know about my preferences?”) → call `getPersonalNetwork` (`mode=profile`) and/or `getUserContext`; answer only from Action data.
4. On `credits_required` / 402 → do not claim success; offer `createCreditCheckoutSession` only if the user wants credits; re-check `getEntitlements` after webhook grant.
5. Product links: call `searchProduct`; render one `affiliate_url` unchanged with `(paid link)`.

Default response table (when giving image/product answers):

| 🟥 Analysis | 🟩 Amazon | 🟦 Context |
|---|---|---|
