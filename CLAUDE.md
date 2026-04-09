# StayHaus Suite

## Overview
Email marketing automation platform built by Valentin (Akimbo-io). Five sub-projects in one monorepo — each folder is independent with its own setup.

## Projects & Priority

| Priority | Folder | What | Status |
|----------|--------|------|--------|
| P1 — Finish | `stayhaus/` | Client onboarding portal → Notion workspace creation | Unfinished |
| P2 — Polish | `cocosolis-figma-translator/` | Figma plugin for translating email designs | Works, needs UI polish |
| P3 — Debug | `email-remixer/` | Gmail → parse → Figma import pipeline | Buggy, needs stabilization |
| Done | `image-translator/` | Image text translation via Gemini | Complete, no work needed |
| Skip | `video-translator/` | Video translation | Superseded, ignore |

## Work Order
Plugins first, then main app: **Figma Translator → Email Remixer → StayHaus**

## Master Task List (from Valentin's HANDOFF.html)

### 01 — StayHaus Portal (P1 — Finish)
Goal: Alex can onboard a real client end-to-end, Notion workspace gets auto-created.
- [ ] Read the full vision (stayhaus-agents-overview.md, stayhaus-handoff.md, stayhaus-phase1-spec.md)
- [ ] Finish onboarding portal — make `onboarding.html` flow end-to-end without bugs
- [ ] Wire to Notion template duplication — on submit, duplicate template + auto-populate fields
- [ ] Handle Klaviyo API key capture securely — no plaintext, no logging
- [ ] Wire Google Drive folder link — save on client's Notion space for downstream agents
- [ ] Test with one real brand — full start-to-finish flow

### 02 — Figma Translator (P2 — Polish) ✅ DONE
Goal: Production-grade plugin — better visual design, cleaner UX, fewer rough edges.
- [x] Redesign plugin UI with StayHaus brand colors
- [x] Fix readability/contrast issues (neutral slate bg + boosted purple opacities)
- [x] Fix re-upload UX (loaded state shows filename + "click to change" hint)
- [x] Fix horizontal scrollbar (preview scrollbar 7px, grabbable)
- [x] Fix "+N more" rows (full-width accent button with hover state)
- [x] Clean up flow (progressive: drop file → chips/preview → source lang → generate)
- [ ] Test with a real Cocosolis email (manual — needs real data from Valentin)

### 03 — Email Remixer (P3 — Troubleshoot & Ship)
Goal: Stable email remixer we can share with others. Scraping flow is good — make it reliable.
- [ ] Get current flow working end-to-end — troubleshoot what's broken
- [ ] Run test suite (`pnpm test`) and fix failures
- [ ] Investigate editable text boxes (explore, not a blocker)
- [ ] Write clean SETUP.md — anyone can run it in under 5 min
- [ ] Ship to 1-2 testers, collect feedback

### 04 — Image Translator (Done)
- No action needed. Optional: create `.env` with `GEMINI_API_KEY` to run locally.

### 05 — Video Translator (Skip)
- Do not spend time here unless Valentin says otherwise.

## Tech Stack by Project

### cocosolis-figma-translator/
- Figma Plugin API, TypeScript
- Self-contained, no backend

### email-remixer/
- **Backend:** Node.js, Gmail API (OAuth2), Cheerio, Sharp, Anthropic SDK (vision)
- **Plugin:** Figma Plugin API, TypeScript, esbuild
- **Tests:** Vitest (`pnpm test`)
- **Server:** HTTP on port 3055
- **Run:** `bash run.sh` (starts parser + server)

### stayhaus/
- **Frontend:** `onboarding.html` (7-step form), deployed to Hostinger
- **Backend:** PHP (`create-portal.php`) / Python (`create_portal.py`)
- **APIs:** Notion API (template duplication), Klaviyo (key capture)
- **Specs:** `stayhaus-handoff.md`, `stayhaus-agents-overview.md`, `stayhaus-phase1-spec.md`
- **Sub-plugin:** `composer/` — Figma plugin for email assembly (TypeScript, esbuild)

### image-translator/ (done, reference only)
- **Backend:** Python, FastAPI, Google Gemini — port 8001
- **Frontend:** Next.js 15, React 19, Tailwind v4 — port 3001

## Conventions
- Each project has its own `package.json` or `requirements.txt` — install deps per-folder
- Figma plugins: build with `npm run build`, dev with `npm run watch`
- No shared dependencies across projects
- `.env` files are gitignored — create locally as needed

## Key Paths
- Onboarding form: `stayhaus/onboarding.html`
- Email parser: `email-remixer/src/parser.js`
- Email remixer plugin: `email-remixer/email-remixer-plugin/`
- Figma translator plugin: `cocosolis-figma-translator/`
- Composer plugin: `stayhaus/composer/`
- Brand data endpoint: `https://stayhaus.eu/brands.json`
