# StayHaus Onboarding Form — Hostinger Setup

Two files. Five minutes. Done.

## Files

- `onboarding.html` — the public form (7 steps, branded)
- `create-portal.php` — backend that creates the Notion portal

## 1. Upload

Upload both files to `public_html/` (or any subfolder, e.g. `public_html/onboarding/`).

URL becomes: `https://stayhaus.eu/onboarding.html`

## 2. Set environment variables

In hPanel → **Advanced → PHP Configuration → PHP Options** (or `.htaccess` / `.user.ini`), set:

```
NOTION_TOKEN     = secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PARENT_PAGE_ID   = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTIFY_EMAIL     = alex@stayhaus.eu
```

`NOTIFY_EMAIL` is optional — if set, you get an email each time a new client submits the form.

### Where to get them

**NOTION_TOKEN**
1. https://www.notion.so/my-integrations → New integration
2. Name: "StayHaus Portal Creator", Type: Internal
3. Copy the **Internal Integration Secret** (starts with `secret_` or `ntn_`)

**PARENT_PAGE_ID**
1. Open the Notion page where new client portals should live (the parent)
2. Share → Connect → add "StayHaus Portal Creator" integration
3. Copy the page URL — the ID is the 32-char hex at the end:
   `https://notion.so/Clients-`**`a1b2c3d4e5f6...`**

## 3. Test

Visit `https://stayhaus.eu/onboarding.html`, fill it in, submit. You'll get a link to the new Notion portal.

## Troubleshooting

- **"Server not configured"** → env vars not set, check hPanel
- **Notion 401** → integration not added to the parent page (Share → Connect)
- **Notion 404** → wrong PARENT_PAGE_ID
- **Form does nothing** → check browser console; PHP file probably 404 (wrong path)

## Notes

- PHP requires curl extension (enabled by default on Hostinger).
- The form saves progress to localStorage so refresh doesn't lose data.
- Token never touches the browser — it lives in PHP env only.
