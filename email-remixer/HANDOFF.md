# Email Remixer Handoff — 2026-04-17 (Session 7)

> **Status: Work in progress — not a final release.**
> The visual layer is in a good place. The canvas scanner still has known
> gaps that need attention before v1.0 ships (see "Open Issues").

## What This Session Delivered

### Plugin shell + UI redesign
Full visual overhaul to match the Cocosolis Translator plugin's aesthetic:
- Fonts: Fraunces (display, italic accents), DM Sans (body), JetBrains Mono (labels/counts)
- Palette: deep obsidian `#0D0B12` with violet `#B47CFD` → pink `#FF7FC2` gradient accents
- Gradient hairline across the top, radial glows in the background
- Inbox + Builder as two "modes" with a sliding gradient underline
- Window size bumped 660 → 760 px height (width unchanged at 520)

### Inbox (emails view)
- 2-column card grid with real email previews (stacked images from the parsed JSON)
- Server endpoint `getEmailPreviews()` returns up to 4 images per email, capped at ~500 KB total
- Cards scale to 1.065 on hover with a violet glow (`z-index` raised so neighbors don't clip)
- Fallback for emails without images: initial letter on a violet→pink gradient
- "Imported" state flips the card border green and disables re-import
- Removed the "Composed Email" name input — compose output is always named "Your Email"

### Builder (section library)
- Category headers now use DM Sans semibold uppercase (readable, Mailsupply-style) with a violet→pink gradient tick under each
- Left-to-right grid (`display: grid`) instead of column flow, so items order 1→2→3→4 across rows
- Thumbnails export at `WIDTH: 500` (was `SCALE: 2`) — sharp on HiDPI without the payload bloat that was freezing the plugin
- Cards crop their visible area using `absoluteRenderBounds` so trailing empty frame space (common for Header Logo, Dividers, short Footers) is hidden — images sit flush with the label
- Hover scales cards; no floating chip anymore
- Removed the loading placeholders: the UI shows "Scanning canvas" + skeleton strips only, and renders the whole library in one shot once all thumbnails are ready

### Scanner fixes (code.ts)
- Defer `workspace-sections` render until thumbnails finish — new `workspace-thumbnails-complete` message
- `getContentHeight()` reads `absoluteRenderBounds` to detect empty trailing space
- **Countdown category split out from CTA** — countdowns were incorrectly merging into the CTA bucket
- Bare single-word sections (e.g. "Header") are suppressed when a more specific sibling shares the first token (e.g. "Header Logo", "Header 1") — fixes the duplicate "Header"/"Header Logo" problem generally

### Empty / loading states
- Replaced italic Fraunces phrases ("gathering sections", "awaiting composition") with clean DM Sans copy ("Gathering sections from canvas", "Your email is empty") — readability fix
- `emptyHtml(title, hint)` helper keeps markup consistent

## Open Issues — **Scanning is still the main thing to fix**

1. **CTA detection is incomplete.**
   - In the current test file only one of two CTAs is being picked up.
   - The one that *is* detected exports as "just the button", not the full CTA block — probably because the CTA frame's content is centered and `absoluteRenderBounds` is tight to the button only.
   - The second CTA is likely named with a variant the scanner doesn't recognize (e.g. `CTA Button`, `Call to Action`, or something non-`CTA N`-shaped). Need to inspect layer names in the source file and extend `CATEGORY_NAME_MAP`.

2. **Still possible for unusual layer names to miss entirely.**
   - `CATEGORY_NAME_MAP` covers the Mailsupply convention (Header/Header N, Header Logo, Body Text, Product Card, etc.) plus a handful of aliases.
   - Non-canonical names (e.g. `Sale Banner`, `Offer Block`, `Nav Bar`) silently don't match. Need a broader alias pass or keyword-based fallback on frame names.

3. **Header count still doesn't match Mailsupply exactly.**
   - Post-fix counts are close but off by 1–2 per category on some files.
   - May be related to container detection (Case 3 in `scanWorkspaceSections`) or to frames buried deeper than two levels.

4. **Compose output: alignment / widths.**
   - Sections of differing widths stack left-aligned in a HUG frame — narrower sections don't center.
   - Stale refs if a user deletes a queued section from the canvas after adding it.

5. **Parser-level gaps (non-UI).**
   - 19 images still have src URLs only (no base64 downloaded) — grey placeholders in Figma.
   - Some flat-HTML emails parse as a single section (Playwright-based renderer deferred).

## Tech Summary

| File | Purpose |
|------|---------|
| `server.js` | HTTP on :3055, serves parsed JSON + email previews |
| `src/parser.js` | HTML → JSON, 13-category keyword heuristics |
| `email-remixer-plugin/src/code.ts` | Figma plugin backend (scan / build / compose) |
| `email-remixer-plugin/src/ui.html` | Plugin UI (editorial dark, two modes) |
| `email-remixer-plugin/dist/code.js` | Built plugin backend |

**Build after `code.ts` changes:**
```bash
cd email-remixer/email-remixer-plugin && npm run build
```

UI is served directly from `src/ui.html` — no build step.

**Restart server after changes:**
```bash
# kill existing node on :3055, then
cd email-remixer && node server.js
```

## Key Constants

| Constant | Location | Purpose |
|----------|----------|---------|
| `VALID_CATEGORIES` | code.ts | 14 categories (added `countdowns`) |
| `CATEGORY_NAME_MAP` | code.ts | Frame name → category, includes aliases |
| `CATEGORY_ORDER`, `CATEGORY_DISPLAY` | ui.html | Library display order + labels |
| `getContentHeight()` | code.ts | Tight content height from `absoluteRenderBounds` |
| `thumbPreviewStyle()` | ui.html | Applies aspect-ratio crop when frame has empty trailing space |
