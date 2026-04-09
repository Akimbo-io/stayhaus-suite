# Email Remixer -- Design Spec

## Overview

A tool that fetches marketing emails from monitored senders, parses them into structured JSON with full decomposition (every text block, image, button as its own element), and imports them into Figma as editable layers via a Figma plugin.

## User Flow

1. Daily cron runs `parser.js` at 9am
2. Parser connects to Gmail via OAuth, fetches new emails from configured senders
3. Each email's HTML is parsed into a structured JSON file + downloaded images (base64-encoded)
4. JSON files land in `~/email-remixer/output/`
5. User opens Figma, runs the Email Remixer plugin
6. Plugin presents a file picker, user selects a JSON file
7. Plugin creates editable frames, text nodes, images, and buttons on the current page
8. Everything is grouped under a top-level frame named `[sender] - [subject] - [date]`

## Architecture

```
Gmail (OAuth2) -> [parser.js cron] -> JSON + base64 images -> [Figma plugin manual import] -> Editable layers
```

### Component 1: Email Parser (`parser.js`)

**Purpose:** Fetch and parse marketing emails into a structured format.

**Tech:** Node.js, `googleapis` (Gmail API), `cheerio` (HTML parsing), `node-fetch` (image downloading)

**Behavior:**
- Reads `config.json` for sender list and paths
- Authenticates with Gmail via OAuth2 (Desktop app flow)
- On first run, opens browser for consent, saves token to `token.json` (includes refresh token)
- On subsequent runs, uses refresh token automatically (access tokens expire after 1 hour; the `googleapis` client handles refresh transparently)
- If token is revoked or invalid, logs an error and writes `last-run-status.json` with `{ "status": "error", "message": "..." }`
- Searches for emails from each sender, filtered to only unprocessed ones
- Tracks processed message IDs in `processed.json` (pruned to last 90 days on each run)
- For each new email:
  - Extracts HTML body from the message
  - Parses HTML with cheerio, walking the DOM tree
  - Produces a JSON file per email in the output directory
  - Downloads all images and encodes them as base64 in the JSON

**HTML Parsing Strategy:**
- Walk top-level `<table>`, `<tr>`, `<td>` structures (email HTML is table-based)
- Extract `<img>` tags -> image elements with src, width, height
- Extract text nodes from `<p>`, `<h1>`-`<h6>`, `<span>`, `<a>`, `<td>` -> text elements with computed styles
- Extract `<a>` tags with button-like styling -> button elements
- Detect sections by table rows / nested tables -> section groups
- Inline styles are parsed for: font-size, font-weight, color, background-color, text-align, border-radius, padding, width, height, line-height, letter-spacing
- MIME handling: walk `multipart/alternative` to find `text/html` part; resolve `cid:` inline image references from `multipart/related` parts
- Images larger than 1200px wide are downscaled; images over 4MB (Figma Plugin API limit) are skipped with a placeholder rectangle
- On parse failure for a single email: skip it, log the error, do not write a partial JSON file, continue with remaining emails
- Writes `last-run-status.json` after each run with summary (emails found, parsed, failed)

### Component 2: JSON Schema (bridge format)

```json
{
  "meta": {
    "sender": "support@hears.com",
    "subject": "Email Subject Line",
    "date": "2026-04-03",
    "messageId": "gmail-message-id"
  },
  "schemaVersion": 1,
  "width": 600,
  "elements": [
    {
      "type": "section",
      "direction": "vertical",
      "padding": [20, 20, 20, 20],
      "bgColor": "#ffffff",
      "children": [...]
    },
    {
      "type": "image",
      "base64": "data:image/png;base64,...",
      "width": 600,
      "height": 300
    },
    {
      "type": "text",
      "content": "Hello World",
      "fontSize": 24,
      "fontWeight": "bold",
      "color": "#1a1a1a",
      "align": "center"
    },
    {
      "type": "button",
      "label": "Shop Now",
      "fontSize": 14,
      "color": "#ffffff",
      "bgColor": "#e63946",
      "borderRadius": 8,
      "href": "https://example.com"
    }
  ]
}
```

**Element types:**
- `section` -- container with direction (vertical/horizontal), padding, background color, children
- `text` -- text node with content, fontSize, fontWeight, color, align
- `image` -- base64-encoded image with width, height
- `button` -- styled link with label, colors, border radius, href
- `spacer` -- vertical or horizontal gap with a height/width value
- `divider` -- horizontal line with color and thickness

### Component 3: Figma Plugin (`email-remixer-plugin/`)

**Purpose:** Import parsed email JSON files into Figma as fully editable layers.

**Tech:** Figma Plugin API (TypeScript), esbuild for bundling

**Structure:**
```
email-remixer-plugin/
  manifest.json       -- Figma plugin manifest
  src/
    code.ts           -- Plugin backend (creates Figma nodes)
    ui.html           -- Plugin UI (file picker)
  dist/
    code.js           -- Bundled output
```

**Plugin UI (`ui.html`):**
- Simple HTML page with an `<input type="file" accept=".json">` 
- On file select, reads the JSON content and posts it to the plugin code via `parent.postMessage()`

**Plugin Code (`code.ts`):**
- Receives JSON via `figma.ui.onmessage`
- Creates a top-level Frame named `[sender] - [subject] - [date]`
- Walks the elements tree recursively:
  - `section` -> Frame with auto-layout (vertical or horizontal), padding, fill color
  - `text` -> TextNode with fontSize, fontWeight (mapped to font family style), fills (color), textAlignHorizontal
  - `image` -> Rectangle with image fill (decoded from base64 via `figma.createImage()`)
  - `button` -> Frame with auto-layout + corner radius + fill color, containing a TextNode
  - `spacer` -> Frame with fixed height/width, no fill
  - `divider` -> Line or thin Rectangle with fill color
- Positions the top-level frame offset from existing content on the page
- Scrolls viewport to the newly created frame

**Font handling:**
- Default to "Inter" (Figma's default, always available)
- Map fontWeight: "bold" -> { family: "Inter", style: "Bold" }, "normal" -> { family: "Inter", style: "Regular" }
- Pre-load all needed font variants (Regular, Bold) at plugin startup via `figma.loadFontAsync()`
- Wrap font loading in try/catch; fall back to Roboto if Inter is unavailable

### Component 4: Configuration

**`config.json`:**
```json
{
  "senders": ["support@hears.com"],
  "outputDir": "./output",
  "processedLedger": "./processed.json"
}
```

**`processed.json`** (auto-generated, pruned to last 90 days each run):
```json
{
  "processedIds": [
    { "id": "msg-id-1", "date": "2026-04-03" },
    { "id": "msg-id-2", "date": "2026-04-03" }
  ]
}
```

### Component 5: Daily Cron

```bash
# crontab entry
0 9 * * * cd /Users/valentinandreev/email-remixer && $(which node) parser.js >> logs/cron.log 2>&1
```

## File Structure

```
~/email-remixer/
  credentials.json          -- Gmail OAuth credentials (already in place)
  token.json                -- Gmail OAuth token (generated on first run)
  config.json               -- Sender list and paths
  processed.json            -- Ledger of processed email IDs
  parser.js                 -- Email fetcher + HTML-to-JSON parser
  package.json              -- Node.js dependencies
  logs/                     -- Cron logs
  output/                   -- Parsed email JSON files
    2026-04-03-support-hears-subject-line-a1b2c3.json
  email-remixer-plugin/     -- Figma plugin
    manifest.json
    src/
      code.ts
      ui.html
    dist/
      code.js
    package.json
    tsconfig.json
```

## Monitored Senders

- `support@hears.com`

## Target Figma File

- AI Almanac: `https://www.figma.com/design/GpSo07x9no0qnRKpaUNHDG/AI-ALMANAC`
- Emails are imported onto page 3 of the file

## Limitations and Known Constraints

1. **Email HTML is messy** -- marketing emails use deeply nested tables, inline styles, and proprietary markup (Outlook conditionals, etc.). The parser uses best-effort extraction; some emails will parse better than others.
2. **Figma plugins can't read local files directly** -- the UI webview uses `<input type="file">` as a workaround.
3. **Images are base64-encoded in JSON** -- this makes files larger but avoids file system access issues in the Figma plugin sandbox.
4. **Font matching is approximate** -- emails use web fonts that may not be in Figma. Everything defaults to Inter.
5. **No CSS media queries** -- the parser extracts the desktop/default view only.

## Future Upgrades

- WebSocket bridge for automatic import (no manual file pick)
- Multiple sender support with per-brand Figma pages
- Font matching (detect common fonts and map to Figma equivalents)
- Gmail label-based capture for one-off emails
