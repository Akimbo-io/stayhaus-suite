# Handoff — StayHaus Suite

Status and next steps for each project in this repo.

---

## 1. `stayhaus/` — needs to be finished

**Status:** In progress. Onboarding portal exists (`onboarding.html`, `index-revamp.html`), workflow JSONs are drafted (v3, v4, BG), phase 1 spec is written.

**Context:** This is the foundation of the whole agency pipeline — see `stayhaus/stayhaus-agents-overview.md`, `stayhaus/stayhaus-agents-visual.html`, and `stayhaus/stayhaus-handoff.md` for the full vision. It's the agent system Valentin and Alex are building together for Alex's email marketing agency.

**Full plan from the Cocosolis / Alex session:** everything in those three files above is the source of truth. The system is 7 agents: Onboarding → Notion Dashboard → Flow Architect (Miro) → Visual Agent (Figma/Canva) → Copywriting (custom GPT) → Translation + Compress (nano banana) → Klaviyo Deploy. Phase 1 = Onboarding → Notion, spec is in `stayhaus/stayhaus-phase1-spec.md`.

**Next:** finish the onboarding portal end-to-end, wire it to Notion template duplication, get it to a state where Alex can onboard a real client through it.

---

## 2. `cocosolis-figma-translator/` — needs polish

**Status:** Working Figma plugin (`code.ts`, `ui.html`, `manifest.json`). Functional but rough.

**Next:** polish and clean up.
- Visual polish — the UI needs to look better
- UX cleanup — flow should be cleaner, fewer rough edges
- Keep the core functionality intact, just make it feel production-grade

---

## 3. `email-remixer/` — troubleshoot and ship

**Status:** Node app with server, plugin, tests. Works for scraping-based remixing.

**Next:**
- **Troubleshoot** — make sure the current scraping flow works reliably end-to-end
- **Investigate editable text boxes** — explore whether we can get editable text boxes rather than just scraping. Not a blocker; scraping-as-is is already pretty good.
- Get it to a state where we can share it with other people confidently

---

## 4. `image-translator/` — done

Self-explanatory and set. No action needed.

---

## 5. `video-translator/` — skip

Valentin has better versions elsewhere. Will check and confirm. No work needed here for now.

---

## Priority order

1. `stayhaus/` — finish it (highest priority, foundation)
2. `cocosolis-figma-translator/` — polish
3. `email-remixer/` — troubleshoot + ship
4. `image-translator/` — done
5. `video-translator/` — skip

## Secrets / setup

- No `.env` files committed. Projects that need API keys (Gemini, Anthropic, etc.) require you to create your own `.env` locally — see each project's setup docs.
- `node_modules/` is gitignored (GitHub's 100MB file limit). Run `pnpm install` / `npm install` per project.
