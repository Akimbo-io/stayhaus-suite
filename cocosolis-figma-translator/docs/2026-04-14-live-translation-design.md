# Design Translator — Live Translation via Claude

## Goal
Let the user translate an email design without preparing a CSV, by calling Claude directly from the plugin UI. CSV mode stays as the default.

## UX
A "Source" switch at the top of the plugin UI toggles between `CSV` (current behavior) and `Live (Claude)`.

Live mode fields:
- Target languages (comma-separated codes, e.g. `bg, de, fr`)
- Source language (reuses existing dropdown, default `EN`)
- Brand context (optional textarea, passed as system prompt)
- API key (entered once in a small Settings drawer, persisted in `figma.clientStorage`; drawer auto-opens on first translate if key is missing)

Button: "Translate & Apply" — one-shot. No preview/edit step.

## Flow
1. UI sends `{type: "scan"}` to the plugin; plugin returns unique text from the selected frame (scan already exists).
2. UI calls `POST https://api.anthropic.com/v1/messages` with header `anthropic-dangerous-direct-browser-access: true`.
3. One request per target language. Body: system prompt (brand context + instruction to return strict JSON mapping source→translation), user prompt containing the list of source texts.
4. Response parsed into the plugin's existing `{sourceLang, targetLangs, rows: [{sourceText, translations}]}` shape.
5. UI posts `{type: "translate", data, autoResize}` — identical to CSV path. `code.ts` is unchanged.

## Error handling
Inline red text in the UI on:
- Missing/invalid key (401) — reopen the Settings drawer
- Rate limit (429) — surface message, no auto-retry
- Malformed JSON from Claude — show raw response, suggest re-run

Partial success across languages is allowed: apply the ones that worked, flag the ones that failed.

## Manifest change
Add `"https://api.anthropic.com"` to `networkAccess.allowedDomains`.

## Model
`claude-opus-4-6` by default (best tone quality). Configurable via a hidden constant — not exposed in UI for MVP.

## Out of scope
- Preview/edit table
- Multiple providers (DeepL, Google)
- Streaming responses
- Rate-limit backoff / retries
- Saving results back as CSV
- Cost estimation in UI

## Files touched
- `cocosolis-figma-translator/ui.html` — new section, Settings drawer, clientStorage helpers, fetch logic
- `cocosolis-figma-translator/manifest.json` — one allowed-domain entry
- `cocosolis-figma-translator/code.ts` / `code.js` — no change
