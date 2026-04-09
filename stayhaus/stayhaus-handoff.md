# StayHaus × Alex — Agent System Handoff

## Context
You're picking up a project Valentin and Alex are building together: an agent-powered email marketing operation for Alex's agency. The agency runs Klaviyo for e-commerce brands. Goal: onboard a brand once, then have agents handle flows, design, copy, translation, and deployment — agency stays on approvals, not in the weeds.

Two reference docs are included alongside this handoff:
- `stayhaus-agents-overview.md` — written overview of all 7 agents
- `stayhaus-agents-visual.html` — editorial blueprint visual (open in browser)

## The 7 agents (full system)

**1. Onboarding Agent** — A guided form that captures:
- Klaviyo direct access (API key)
- Brand overview, tone, differentiators
- Customer pains, desired outcomes, USPs
- Hard-to-copy advantages, one-sentence pitch
- Google Drive folder link (assets, logos, photography)
- Brand guidelines (fonts, colors, voice rules)
- Product catalog
- Languages required, approver

The Bulgarian intake form Valentin already has includes these questions:
- Brand Overview (2–3 sentences: who you are, tone, what sets you apart)
- Customer Insights (pains, desired outcomes, motivations)
- What customers want to achieve with your products
- What customers say makes them choose you
- What differentiates your product
- Clear USPs (concrete list)
- Real hard-to-copy competitive advantages
- One-sentence "why us" pitch

**2. Notion Dashboard** — Each client gets their own workspace, duplicated from a Notion template Valentin already has. Auto-populated from onboarding submission. Sections: brand profile, asset library (Drive sync), flow roadmap (planning → design → copy → built → live), campaign calendar, performance snapshots from Klaviyo, approvals. Client + agency both see live progress.

**3. Flow Architect (Miro)** — Library of master email flow templates in Miro: Welcome, Abandoned Cart, Post-Purchase, Winback, Browse Abandonment. Agent picks the right templates by product type and personalizes branches/timing. Outputs a Miro board + structured spec for design and copy agents.

**4. Visual Agent (Figma or Canva — TBD)** — Pulls assets from the client's Drive folder. Builds emails on-brand using the brand guidelines. Exports section by section (hero, body, CTA, footer) so the translation agent can swap pieces cleanly.

**5. Copywriting Agent** — Wires Valentin's existing custom GPT into the pipeline. Inputs: brand profile, ICP insights, USPs, flow context, product details. Outputs: subject line, preview text, body, CTAs.

**6. Translation + Compress Agent (the critical path)** — The trick that makes this scale. Workflow:
1. Slice a finished email into sections (hero, body blocks, image-text blocks, CTAs, footer)
2. Classify each section as text vs image-with-baked-in-text
3. Text sections → translate in place
4. Image-with-text sections → regenerate via **nano banana** with translated text baked in, on-brand
5. Aggressive image compression for inbox weight
6. Reassemble as Klaviyo-ready blocks per language

**7. Klaviyo Deployment Agent** — Authenticates via the client's Klaviyo credentials from onboarding. Uploads images to Klaviyo asset library. Builds the email inside the right flow/campaign. Tags by language, flow, version. Leaves as draft for human approval.

## End-to-end pipeline
Signup → Onboarding Agent captures everything → Notion Dashboard auto-created → Flow Architect picks Miro templates → Visual Agent builds designs from Drive assets → Copy Agent drafts via custom GPT → Translation Agent localizes (nano banana for image text) + compresses → Klaviyo Deploy Agent uploads as drafts → client approves in Notion or Klaviyo → live.

## Stack (proposed, not locked)
- **Notion API** — workspace duplication, auto-population
- **Klaviyo API** — asset upload, flow/campaign building
- **Miro** — master flow templates
- **Figma or Canva** — visual design (decision pending)
- **Custom GPT** — copywriting (Valentin's existing one)
- **Nano banana** — image regeneration for translated image-text
- **Google Drive API** — asset ingestion

## Recommended build order (to discuss)
This is too big for one spec. Decompose into phases, each shipping value:

1. **Onboarding → Notion** (foundation — every other agent reads from here)
2. **Translation + Compress + Klaviyo deploy** (highest leverage — works manually right away)
3. **Copy agent wiring** (custom GPT into pipeline)
4. **Flow Architect** (needs Miro template library curated first)
5. **Visual Agent** (fuzziest — Figma vs Canva still TBD — save for last)

Each phase = its own spec → plan → build cycle.

## Open questions for Alex
1. Figma or Canva — which does the agency already live in?
2. How many languages on average per client?
3. Approvals — in Notion, or directly in Klaviyo drafts?
4. Where do we vault Klaviyo credentials post-onboarding?
5. Performance reporting cadence in the dashboard?
6. Who curates the master flows in Miro?
7. Which phase do you want to build first? (recommendation: phase 1, but phase 2 is tempting because it removes the most painful manual work today)

## What Valentin needs from you
Pick the phase you want to start with, answer the open questions you have opinions on, and start brainstorming the first spec. The next step is a focused design doc for **one phase only** — not the whole system.
