# StayHaus Suite — Session Handoff

## Project Status Overview

| Project | Priority | Status |
|---------|----------|--------|
| cocosolis-figma-translator/ | P2 Polish | DONE — user confirmed UI/UX work complete |
| email-remixer/ | P3 Debug | DONE — bugs fixed, 25/25 tests pass, plugin builds, SETUP.md updated |
| stayhaus/ | P1 Finish | IN PROGRESS — Notion integration works, form needs UI redesign + testing |

## What Was Done This Session

### Email Remixer (P3) — Complete
- Plugin built: `email-remixer-plugin/` → `dist/code.js` (11.7kb)
- Tests: 25/25 passing (`npm test`)
- Bug fix: CID inline images — `index.js` used array as object, fixed to proper `{contentId: data}` map
- Bug fix: `server.js` crash on missing `output/` — now returns empty array
- Bug fix: `auth.js` cross-platform browser launch (was macOS-only)
- SETUP.md reviewed and updated (OAuth wording, redirect URI note, test section added)
- Editable text investigation: text is already editable post-import (real TextNodes). In-plugin editor not worth building.

### StayHaus Portal (P1) — In Progress
- Read all vision docs (stayhaus-handoff.md, stayhaus-agents-overview.md, stayhaus-phase1-spec.md)
- **Notion integration working** — tested with demo data, creates full portal structure
- **Klaviyo API key field added** to form step 6 (password input, required)
- **Klaviyo key stored securely** in Notion "Достъп" child page (both PHP + Python backends)
- **Dev server created** (`dev-server.js`) — serves form + proxies submit to Python script
- **Start script** (`start.sh`) — sets env vars and launches dev server on port 3060
- **Fixed double-submit** — added `submitting` guard flag + better loading text
- **Fixed Bulgarian encoding** — Python stdin reads as `sys.stdin.buffer.read().decode('utf-8')` instead of cp1252

### Known Issue Found
- Bulgarian text was broken on Notion due to Windows Python cp1252 encoding — FIXED but user needs to re-test to confirm Cyrillic now works correctly

## Notion Credentials (for dev testing)
- Integration name: "StayHaus"
- NOTION_TOKEN: `ntn_f62867633736B57p97ZW7tB8AOwXdxP2Jbq505nW3A366v`
- PARENT_PAGE_ID: `33d176b8656d80b0b4e7d3da88920c9f`
- Run locally: `bash stayhaus/start.sh` → http://localhost:3060

## Remaining Tasks (from HANDOFF.html, Project 01)

### Must Do
- [ ] **Re-test form submission** — confirm Bulgarian/Cyrillic text renders correctly in Notion after encoding fix
- [ ] **UI redesign of onboarding.html** — user wants improvements (no specific direction yet — ask them)
- [ ] **Test with one real brand** — full end-to-end flow with real data
- [ ] **Clean up duplicate test portals** in Notion (user created several by double-clicking)

### Already Done
- [x] Read the full vision docs
- [x] Wire to Notion template duplication (create_portal.py + create-portal.php)
- [x] Handle Klaviyo API key capture (added to form + stored in Notion Достъп page)
- [x] Wire Google Drive folder link (already passes through to Notion)

### Not Started / Blocked
- [ ] Ship to 1-2 testers — needs stable form first
- [ ] Deploy to Hostinger — needs PHP env vars set (NOTION_TOKEN, PARENT_PAGE_ID)

## Design Decisions Made (don't re-ask)
- Figma Translator: dark theme with StayHaus brand colors — DONE, don't touch
- Form posts to `create-portal.php` (works on Hostinger + dev server handles same path)
- Klaviyo key: stored in Notion "Достъп" page, not in brands.json
- Python backend is the primary for local dev; PHP is for Hostinger production

## Key Files — StayHaus Portal
- Onboarding form: `stayhaus/onboarding.html`
- PHP backend: `stayhaus/create-portal.php` (Hostinger production)
- Python backend: `stayhaus/create_portal.py` (local dev, richer portal structure)
- Dev server: `stayhaus/dev-server.js` (Node, serves form + proxies to Python)
- Start script: `stayhaus/start.sh` (sets env vars, runs dev server)
- Setup guide: `stayhaus/ONBOARDING-SETUP.md`
- Vision docs: `stayhaus/stayhaus-handoff.md`, `stayhaus/stayhaus-agents-overview.md`, `stayhaus/stayhaus-phase1-spec.md`
- Brands data: `stayhaus/brands.json` (written by PHP backend on submit)

## Environment
- Dev server: `bash stayhaus/start.sh` → http://localhost:3060
- Python 3.14 on Windows (use `python3` command)
- Node v24 (ESM by default, no package.json in stayhaus/)
- Figma Desktop required for plugin work
