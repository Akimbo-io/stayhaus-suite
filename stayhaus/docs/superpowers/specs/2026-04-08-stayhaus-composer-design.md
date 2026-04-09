# StayHaus Composer — Figma Plugin Design Spec

**Date:** 2026-04-08
**Author:** Valentin (with Claude)
**Status:** Approved for planning

## What we're building

A Figma plugin called **StayHaus Composer** that lets a designer assemble a fully on-brand, multi-language Klaviyo email in seconds. Designer picks a brand, picks a flow, picks sections, picks an offer, clicks Generate. Plugin clones master template components from a shared Figma library, restyles them with the brand's colors and fonts, generates copy via OpenAI (using a recreated version of Valentin's existing custom GPT), generates imagery via Google's nano banana, and drops the assembled email into the active Figma file as editable section components. Designer iterates on the BG master, then clicks Translate to fan out to RO + GR, with image-text regenerated per language.

## Why

Today, building a single client email takes hours of manual work across copy, design, and translation. Doing 3 languages means doing it three times. The Composer turns that into one click of "good enough to iterate on" output that the designer perfects rather than builds from scratch. Phase 1 (onboarding → Notion portal) captures the brand layer the Composer reads from. The Composer is the bridge between brand data and shipped emails.

## Decisions locked during brainstorming

| Question | Decision |
|---|---|
| Output of Generate | Full email, swappable sections |
| Brand data source | `brands.json` static file on Hostinger, written by `create-portal.php` |
| Master template authoring | A shared Figma library file (designers edit in Figma, no code) |
| Offer input | Picker with common presets (% off, BOGO, free shipping, new launch, restock, event) + free-text override |
| Image source | Nano banana generation from brand profile + manual drop-in fallback. Drive integration explicitly out of scope for v1. |
| Copy generation | OpenAI API recreating Valentin's custom GPT system prompt, enriched with brand profile, offer context, and any custom GPT knowledge files |
| Translation | Master-first (BG), translate-on-demand to RO + GR. Image-text regenerated via nano banana per language. |
| Plugin UI | Single panel layout (Figma-native feel), not stepped wizard |
| Master language | Bulgarian |
| Phase scope | 2a, 2b, 2c only. 2d (Drive integration, Klaviyo deployment) explicitly later. |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIGMA PLUGIN (UI)                            │
│  Single sidebar panel. React + Figma Plugin API.                │
│  Brand picker, Flow picker, Section list, Offer picker,         │
│  Language checkboxes, Generate button, Translate button.        │
└──────────────┬──────────────────────────────────────────────────┘
               │
   ┌───────────┼───────────────┬─────────────────┬──────────────┐
   ▼           ▼               ▼                 ▼              ▼
┌─────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────┐
│ Brands  │ │ Master      │ │ OpenAI       │ │ Nano     │ │ Figma    │
│ JSON    │ │ Templates   │ │ (copy)       │ │ Banana   │ │ Active   │
│ on      │ │ Figma File  │ │ chat compl.  │ │ Gemini   │ │ File     │
│ Hostingr│ │ Team Lib    │ │ + sys prompt │ │ image API│ │ (output) │
└─────────┘ └─────────────┘ └──────────────┘ └──────────┘ └──────────┘
```

### External services

API keys are stored in Figma `clientStorage` per designer. Settings panel in the plugin holds them.

1. **OpenAI API** — `gpt-4o` (or newer) chat completions. Used for copy generation and translation.
2. **Google Gemini API (nano banana)** — image generation. API-key auth, no OAuth.
3. **Figma Plugin API** — internal, for reading the team library and writing to the active file. No external auth.

### Static infrastructure

- **`brands.json`** on `https://stayhaus.eu/brands.json` — auto-generated. `create-portal.php` is extended to (a) create the Notion portal as today, and (b) append/update an entry in `brands.json` with a normalized brand profile.
- **StayHaus Master Templates** Figma file — a shared team library, structured as one page per flow, with named components per section variant.

## Data shapes

### `brands.json`

```json
{
  "version": 1,
  "updated_at": "2026-04-08T10:00:00Z",
  "brands": [
    {
      "slug": "demo-cosmetics-bg",
      "name": "Demo Cosmetics BG",
      "website": "https://demo-cosmetics.bg",
      "languages": ["BG", "RO", "GR"],
      "notion_url": "https://notion.so/...",
      "profile": {
        "description": "...",
        "customer_insights": "...",
        "desired_outcome": "...",
        "why_us": "...",
        "differentiation": "...",
        "usp": "...",
        "hard_to_copy": "...",
        "one_sentence": "..."
      },
      "guidelines": {
        "colors": { "primary": "#2D5016", "accent": "#F5F0EB", "bg": "#FFFFFF" },
        "fonts": { "heading": "Playfair Display", "body": "Inter" },
        "tone": "warm, authentic"
      },
      "drive_link": "https://drive.google.com/...",
      "approver": { "name": "...", "email": "..." }
    }
  ]
}
```

### Master template structure

```
StayHaus Master Templates (Figma file, shared as Team Library)
├── Page: Welcome Flow
│   ├── Component: hero/v1, hero/v2, hero/v3
│   ├── Component: body/v1, body/v2
│   ├── Component: cta/v1, cta/v2
│   └── Component: footer/v1
├── Page: Abandoned Cart
├── Page: Post-Purchase
├── Page: Winback
└── Page: Browse Abandonment
```

Each component has a strict naming convention for layers:

**Text layers (UPPERCASE, underscored):**
- `HEADLINE`, `SUBHEAD`, `BODY`, `CTA_LABEL`, `OFFER_TEXT`, `FOOTER_LEGAL`

**Image fills:**
- `HERO_IMAGE`, `PRODUCT_IMAGE`, `LIFESTYLE_IMAGE`
- Suffix `_HASTEXT` if the image has baked-in text that must be regenerated per language. Example: `HERO_IMAGE_HASTEXT`.

**Color tokens (Figma variables):**
- `BRAND_PRIMARY`, `BRAND_ACCENT`, `BRAND_BG`
- The plugin overrides these variables on the cloned frame, not on individual layers.

This convention is the contract between the master library and the plugin. Components that don't follow it are skipped with a warning.

### OpenAI request shape (copy generation)

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "<recreated custom GPT system prompt>" },
    {
      "role": "user",
      "content": "Brand profile: <JSON>\nFlow: Welcome\nSection: hero\nOffer: 20% off, ends 2026-04-12\nLanguage: BG\nReturn JSON with keys: HEADLINE, SUBHEAD, BODY, CTA_LABEL, OFFER_TEXT."
    }
  ],
  "response_format": { "type": "json_object" }
}
```

If the existing custom GPT has knowledge files attached, those are inlined into the system prompt as context blocks (or, if too large, the plugin uses the OpenAI Assistants API with file_search instead of chat completions — decided during build).

### Nano banana prompt template

```
Editorial product photography for {brand.name}, a {brand.profile.one_sentence}.
{section_role} composition. Brand aesthetic: {brand.guidelines.tone}.
Color palette: {brand.guidelines.colors}.
Clean magazine-quality lighting. {offer_context_if_hero}.
No text in image. {if_HASTEXT: Include the text "{translated_text}" rendered in {brand.fonts.heading}, prominently placed.}
```

## End-to-end flow

```
Designer opens plugin in Figma → picks options → clicks Generate

1. Plugin reads selections: brand_slug, flow, [sections], offer, languages.
2. Plugin fetches brands.json, finds the brand, loads its profile.
3. Plugin reads master template library, clones picked variants into a
   new frame in the active file: "{brand.slug} / {flow} / BG".
4. Plugin overrides Figma variables BRAND_PRIMARY/ACCENT/BG with brand
   colors. Swaps text layer fonts to brand.fonts.heading and brand.fonts.body.
5. Plugin calls OpenAI in parallel, one request per section. Each response
   is JSON; values are written into matching named text layers.
6. Plugin calls nano banana per image slot. For each slot, 4 variants
   are returned. Plugin shows them; designer picks one (or auto-pick first).
7. Designer iterates: swap a hero variant, regenerate one section's copy,
   regenerate one image, type custom copy.
8. When happy, designer clicks Translate.
9. Plugin clones the BG frame twice into "...RO" and "...GR" frames.
10. For each text layer in each clone: calls OpenAI to translate
    ("Translate to Romanian, preserve brand voice and the offer literally").
11. For each image layer with the _HASTEXT suffix: regenerates via nano
    banana with the translated text baked into the prompt.
12. Other images: copied as-is from the BG frame.
13. Result: three side-by-side language frames in Figma, all editable.
```

## Error handling

| Failure | Behavior |
|---|---|
| `brands.json` fetch fails | Plugin shows: "Can't reach stayhaus.eu, check connection." Generate button disabled. |
| OpenAI request fails for one section | Section's text layers stay as template placeholders. Toast: "Copy failed for {section}, retry?" Per-section retry button. |
| Nano banana request fails for one slot | Image slot stays as template placeholder. Per-slot retry button. |
| Master template missing a picked variant | Plugin warns: "{section}/{variant} not found in library, using {section}/v1 instead." Continues. |
| Brand has no `guidelines.fonts` set | Plugin uses Figma defaults and warns: "No fonts defined for this brand, using Inter." |
| OpenAI / Gemini API key missing or invalid (401) | Plugin shows: "Invalid {service} API key, check Settings." Generate disabled until fixed. |
| Rate limit / quota exceeded (429) | Plugin retries once with backoff, then shows: "{service} rate limit hit, try again in a minute." |
| Partial translation failure (e.g. RO ok, GR fails) | Successful language frames are kept. Failed language shows a "Retry GR" button on its frame. |
| `brands.json` write race in `create-portal.php` | PHP uses `flock()` exclusive lock around the read-modify-write of `brands.json`. |

## Testing

Each phase has its own test surface:

- **Phase 2a (foundation):** integration test that picks a known brand from a fixture `brands.json`, picks Welcome flow + hero variant, asserts that the active Figma file gets a new frame with the right colors, fonts, and structure. No AI calls. Run via the Figma plugin's headless test mode.
- **Phase 2b (copy):** mock OpenAI client returning canned JSON; assert that text layers contain the canned strings.
- **Phase 2c (images + translation):** mock Gemini client returning canned image URLs; assert image fills are set. End-to-end "happy path" test that goes brand-pick → BG generate → translate → 3 frames exist with translated text layers.

Manual testing: a "Demo Cosmetics BG" fixture brand in `brands.json` and a single Welcome flow in the master template, used for every dev iteration.

## Build phases

### Phase 2a — Foundation (no AI yet)

**Goal:** designer can pick a brand + flow + sections, get a Figma frame with the right structure and brand styling. Fills in copy/images by hand. Validates the whole architecture before adding AI.

Scope:
- Extend `create-portal.php` to write/update `brands.json` after creating the Notion portal.
- Author the StayHaus Master Templates Figma file. **Welcome flow only.** 2-3 variants per section. Establish the naming convention and Figma variables.
- Build the Figma plugin shell with the single-panel UI: brand picker, flow picker, section list, offer picker, generate button. No language checkboxes yet.
- Generate logic: clone components from master library, apply brand colors via Figma variables, swap fonts.
- Settings panel placeholder (no API keys yet).

**Ship criterion:** Demo Cosmetics BG → Welcome flow → 3 sections → click Generate → branded skeleton appears in Figma. The `brands.json` source for 2a is the live `https://stayhaus.eu/brands.json` (PHP write must land in 2a, not deferred), so 2b/2c don't depend on a fixture swap.

### Phase 2b — Copy generation

**Goal:** plugin produces a fully-written BG email skeleton.

Scope:
- Settings panel: OpenAI API key field, stored in `clientStorage`.
- Recreate the custom GPT system prompt in plugin source. Include knowledge file inlining or Assistants API decision.
- Per-section copy generation, parallel requests, JSON response parsing, write into named text layers.
- Per-section regenerate button.
- Loading + error states per section.

**Ship criterion:** same as 2a but the copy is filled in correctly for the picked offer.

### Phase 2c — Image generation + translation

**Goal:** the full vision. End-to-end from brand pick to 3-language Figma drafts.

Scope:
- Settings panel: Gemini API key.
- Nano banana prompt builder using brand profile.
- Variant picker UI: 4 generated images per slot, designer picks one.
- Per-slot regenerate button.
- Language checkboxes in main UI (BG always master, RO + GR optional).
- Translate button: frame cloning, text layer translation via OpenAI, image-text regeneration via nano banana.
- Side-by-side layout of the 3 language frames in the active file.

**Ship criterion:** Demo Cosmetics BG → Welcome → all sections → BG + RO + GR → click Generate → 3 finished editable email frames in Figma.

### Out of scope (Phase 2d, later spec)

- Google Drive integration for curated photography
- Klaviyo deployment agent (uploading the finished email to Klaviyo as a draft)
- Performance reporting in Notion
- Flow Architect Miro integration
- Custom-built master templates beyond the initial 5 flows

## Open questions resolved during build (not blocking the spec)

- **Where does the custom GPT system prompt come from?** Valentin pastes it into `plugin/src/copy/system-prompt.ts` as a string constant during 2b implementation.
- **Knowledge files: inline or Assistants API?** Decided in 2b based on file size. < 50KB total → inline. Otherwise Assistants API with file_search.
- **Does the master template use auto-layout?** Yes, every section component is built with Figma auto-layout so resizes work cleanly when text grows during translation.
- **Per-designer or shared API keys?** Per-designer in `clientStorage` (each designer brings their own keys). Documented in plugin onboarding.
