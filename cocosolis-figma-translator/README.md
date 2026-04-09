# Design Translator — Figma Plugin

Translates email designs in Figma into multiple languages. Upload a CSV or Excel file with translations, select a source frame, and the plugin duplicates it once per target language with all text replaced.

## How It Works

1. **Select a frame** in Figma (the email design to translate)
2. **Upload a CSV/Excel file** with language columns (e.g. `en`, `bg`, `de`, `fr`)
3. **Choose the source language** (defaults to EN)
4. **Click "Generate Translations"** — the plugin clones the frame for each target language and swaps text by matching content

Text matching is **content-based** (not layer names), so it works with any Figma file structure.

## Features

- CSV, TSV, and Excel (.xlsx/.xls) import with auto-delimiter detection
- Multi-sheet Excel support (auto-skips "Schedule" sheets)
- Email metadata detection (Subject Line, Preview Text) — rendered as labeled blocks above each translated frame
- Auto text resize options: height, width+height, keep original, truncate
- Scan Frame tool to preview text layers before translating
- Create Sample tool to generate a demo email frame for testing
- Auto-resizing plugin window

## File Format

CSV with language codes as headers:

```
en,bg,de,fr
Summer Collection,Лятна колекция,Sommerkollektion,Collection d'Été
Shop Now,Пазарувай сега,Jetzt einkaufen,Acheter maintenant
```

Excel files can include a label column (column A) with language codes starting from column B. Rows labeled "subject" or "preview" are treated as email metadata.

### Supported Languages

EN, BG, EL/GR, RO, HU, HR, CS/CZ, SK, PT, ES, IT, FR, DE, PL, RU, NL, DA/DK, SR/RS, SV, FI, NO, TR — plus compound codes like `GR + CY`, `FR + LU + BE`, `DE + AT`.

## Setup

No build step needed — the plugin is plain TypeScript + HTML.

1. Open Figma Desktop
2. Go to **Plugins → Development → Import plugin from manifest**
3. Select `manifest.json` from this folder
4. Run the plugin from **Plugins → Development → Design Translator**

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Figma plugin manifest |
| `code.ts` | Plugin backend — frame cloning, text matching, font loading |
| `code.js` | Compiled output (loaded by Figma) |
| `ui.html` | Plugin UI — file upload, preview table, controls |
| `example.csv` | Sample translation file (EN, BG, DE, FR, ES, IT) |

## Tech

- Figma Plugin API 1.0
- SheetJS (xlsx) for Excel parsing — loaded from CDN
- No bundler, no dependencies, no backend
- Dark theme with StayHaus brand colors (purple/pink accent system)
