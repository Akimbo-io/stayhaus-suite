# Email Remixer

## Architecture
Two-part system: Node.js backend (scrape/parse) + Figma plugin (import/render)

### Backend Pipeline
`node src/index.js` → Gmail OAuth → fetch emails → parse HTML → download images → save JSON to `output/`

### Key Files
| File | Purpose |
|------|---------|
| `src/parser.js` | HTML→JSON parser (core logic, ~480 lines) |
| `src/index.js` | Orchestration: Gmail→parser→output |
| `src/gmail.js` | Gmail API: fetch by sender or raw query |
| `src/auth.js` | OAuth2 flow (port 8080 callback) |
| `src/images.js` | Image download, resize (sharp), base64 encode |
| `src/vision.js` | Claude AI image analysis (exists but NOT integrated) |
| `server.js` | HTTP server on port 3055, serves parsed JSON to plugin |
| `email-remixer-plugin/src/code.ts` | Figma plugin: builds frames from JSON |
| `email-remixer-plugin/src/ui.html` | Plugin UI panel |
| `config.json` | Sender list + Gmail queries + paths |

### Config
- `senders`: array of email addresses to scrape (from:X)
- `queries`: array of raw Gmail queries (e.g. "category:promotions")
- `outputDir`: where parsed JSON goes (./output)
- `processedLedger`: dedup ledger (./processed.json)

### Parser Strategies (in order)
1. MJML/Klaviyo: `div[max-width:500-800px]` > table
2. Multi-row (Stripo/Mailchimp): 100% wrapper table with multiple ~600px content tables
3. Classic single table: width 600/640/580/700, style width, align=center, largest, first
4. Body fallback: extract directly from body children (plain HTML emails)

### Credentials
- `credentials.json` — Google OAuth client (Desktop app type)
- `token.json` — saved OAuth token (auto-refreshes)
- Google Cloud project: StayHaus Email Remixer
- Test users must be added in OAuth consent screen

## Development
- `pnpm install` → `pnpm test` (vitest, 25 tests)
- `node src/index.js` to scrape
- `node server.js` to serve (port 3055)
- Plugin connects to localhost:3055

## Decision Log
| Date | Decision | Why |
|------|----------|-----|
| 2026-04-15 | Added `queries` field to config.json | Allows Gmail search queries (category:promotions) without knowing specific sender addresses |
| 2026-04-15 | Save raw HTML to `raw-html/` dir | Enables debugging parser failures against real email HTML |
| 2026-04-15 | Rewrote parser with 4-strategy approach | Old parser failed on Mailchimp, Stripo, and plain HTML emails |
| 2026-04-15 | Added CONTAINER_TAGS set (center, section, article, etc.) | Mailchimp wraps content in `<center>` which old parser couldn't traverse |
