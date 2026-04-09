# StayHaus x Alex — Agents & Automation Overview

## Vision
Build an agent-powered email marketing operation for Alex's agency. Clients onboard once, get a dedicated Notion workspace auto-populated with their brand info, and we deliver Klaviyo flows/campaigns at scale with multi-language support and lightweight personalization per product type.

---

## 1. Client Onboarding Agent

**Purpose:** Capture everything we need from a new brand in a single guided flow.

**Inputs collected:**
- Klaviyo direct access (API key or shared login)
- Brand overview (2–3 sentences: who they are, tone of voice, what sets them apart)
- Customer insights (pains, desired outcomes, motivations)
- USPs / hard-to-copy competitive advantages
- One-sentence "why us" pitch
- Google Drive folder link (assets, logos, product photos)
- Brand guidelines (fonts, colors, do/don'ts)
- Product catalog / categories

**Outputs / actions:**
- Creates a new client space in Notion from a template I already have
- Populates the space with all submitted info
- Stores Klaviyo credentials securely
- Triggers downstream agents (flow planning, asset ingestion)
- Notifies Alex + me in Slack/email when a new client is ready

**Form questions** (mirroring the Bulgarian intake form):
- Brand Overview
- Customer Insights
- Desired outcome customers want
- What customers say makes them choose you
- What differentiates the product
- Clear USPs (list)
- Real, hard-to-copy competitive advantages
- One-sentence pitch

---

## 2. Notion Client Dashboard (Template-Driven)

**Purpose:** Each client gets their own internal dashboard so they (and the agency) can see flow/campaign progress live.

**Sections:**
- Brand profile (auto-filled from onboarding)
- Asset library (synced from their Drive folder)
- Flow roadmap (status per flow: planning → design → copy → built → live)
- Campaign calendar
- Performance snapshots (pulled from Klaviyo)
- Comments / approvals

**Mechanism:** Template duplication on onboarding submit, fields populated via Notion API.

---

## 3. Flow Architect Agent (Miro-based)

**Purpose:** Build the email flows visually in Miro using a master template, then personalize per product type.

**How it works:**
- Master flow templates live in Miro (Welcome, Abandoned Cart, Post-Purchase, Winback, Browse Abandonment, etc.)
- Agent picks the right template based on product type and brand info
- Adds slight personalizations (timing, branching, product-specific touchpoints)
- Outputs a finalized Miro board per client + a structured spec for the design/copy agents

---

## 4. Design Agent (Figma / Canva)

**Purpose:** Produce email visuals on-brand.

- Pulls brand assets from the client's Drive folder
- Uses brand guidelines (colors, fonts, imagery style)
- Generates email designs in Figma or Canva (TBD which fits better)
- Exports section-by-section (hero, body, CTA, footer) for easy translation later

---

## 5. Copywriting Agent (Custom GPT)

**Purpose:** Write email copy in the brand's tone.

- Uses my existing custom GPT for email copywriting
- Inputs: brand profile, customer insights, USPs, flow context, product details
- Outputs: subject line, preview text, body copy, CTAs

---

## 6. Translation & Localization Agent

**Purpose:** Ship the same email in multiple languages with minimal manual work.

**Workflow:**
- Take a finished email (designed + copywritten)
- Chop it into sections (hero image, body text blocks, image-with-text blocks, CTAs)
- For **text sections:** translate in place, replace text directly
- For **image sections with text baked in:** translate via nano banana (image generation/editing model), regenerate the image with translated text
- Compress all images aggressively for email weight
- Reassemble into Klaviyo-ready blocks

---

## 7. Klaviyo Deployment Agent

**Purpose:** Drop finished, translated, compressed assets straight into the right Klaviyo account.

- Authenticated via the client's Klaviyo access from onboarding
- Uploads images to Klaviyo's asset library
- Builds the email in the correct flow/campaign
- Tags by language, flow, version
- Sets to draft for human review before going live

---

## End-to-End Flow

1. New client signs up → **Onboarding Agent** captures everything
2. **Notion Dashboard** auto-created from template, populated
3. **Flow Architect** picks templates in Miro, personalizes
4. **Design Agent** builds visuals in Figma/Canva using brand assets
5. **Copywriting Agent** drafts copy via custom GPT
6. **Translation Agent** localizes (text + nano banana for image text), compresses
7. **Klaviyo Deployment Agent** uploads to client's Klaviyo as drafts
8. Client sees progress live in their Notion dashboard, approves, we push live

---

## Open Questions for Alex
- Figma vs Canva — which does the agency already work in?
- How many languages on average per client?
- Approval flow: client approves in Notion, or directly in Klaviyo drafts?
- Who owns the Klaviyo credentials post-onboarding (agency vault?)
- Performance reporting cadence in the Notion dashboard (daily/weekly)?
