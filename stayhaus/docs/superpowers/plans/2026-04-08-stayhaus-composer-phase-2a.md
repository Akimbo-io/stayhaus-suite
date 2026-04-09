# StayHaus Composer — Phase 2a Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation of the StayHaus Composer Figma plugin: a single-panel UI that picks a brand from `brands.json`, picks a Welcome flow + sections, and clones brand-styled section components from a shared Figma master library into the active Figma file. No AI yet — copy and images are filled in by hand.

**Architecture:** Two units. (1) A small extension to the existing PHP onboarding endpoint (`create-portal.php`) so every onboarding submission also appends/updates a normalized entry in `brands.json` published at `https://stayhaus.eu/brands.json`. (2) A Figma plugin built with the standard Figma plugin TypeScript template — UI in `ui.html` (vanilla HTML/CSS, no React in 2a to keep the toolchain minimal), business logic in `code.ts` (the plugin sandbox). Plugin fetches `brands.json`, lets the user pick brand + flow + sections + offer, then clones the chosen components from the team library and applies brand colors via Figma variables and brand fonts via direct text-layer mutation.

**Tech Stack:** PHP 8 (Hostinger), TypeScript, Figma Plugin API, vanilla HTML/CSS for the plugin UI, `esbuild` for plugin bundling, no test framework in 2a (validation is manual against a fixture brand — proper tests come in 2b once OpenAI mocking is needed).

**External dependency provided by Valentin/Alex (parallel work, blocks final ship of 2a):**
- A "StayHaus Master Templates" Figma file shared as a Team Library, containing one page "Welcome Flow" with 2-3 component variants per section (hero, body, CTA, footer), all named per the spec convention (`HEADLINE`, `HERO_IMAGE`, etc.), all using auto-layout, with three Figma color variables defined: `BRAND_PRIMARY`, `BRAND_ACCENT`, `BRAND_BG`.

---

## File structure

**Created:**
- `composer/manifest.json` — Figma plugin manifest
- `composer/package.json` — npm deps (`@figma/plugin-typings`, `typescript`, `esbuild`)
- `composer/tsconfig.json` — TS config for the plugin sandbox
- `composer/build.mjs` — esbuild script
- `composer/src/code.ts` — plugin sandbox entry (Figma API access, message handler)
- `composer/src/ui.html` — plugin UI (single panel, vanilla HTML/CSS/JS)
- `composer/src/lib/brands.ts` — brands.json fetch + types
- `composer/src/lib/library.ts` — master template library reader
- `composer/src/lib/compose.ts` — clone components, apply brand styling
- `composer/README.md` — local dev + load-in-Figma instructions

**Modified:**
- `create-portal.php` — after successful Notion creation, append/update normalized brand entry in `brands.json` with `flock()` locking
- `.gitignore` — ignore `composer/node_modules`, `composer/dist`

**On Hostinger after deploy (not in repo):**
- `public_html/brands.json` — written by `create-portal.php`, served as static file

---

## Chunk 1: brands.json producer (PHP side)

### Task 1: Extend create-portal.php to write brands.json

**Files:**
- Modify: `create-portal.php` — add `update_brands_json()` function and call it after Notion creation succeeds

- [ ] **Step 1: Add slug helper function**

Add near the top of `create-portal.php` (after the `rt()` helper):

```php
function slugify($s) {
    $s = mb_strtolower($s, 'UTF-8');
    // Cyrillic transliteration (Bulgarian-friendly)
    $tr = ['а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ж'=>'zh','з'=>'z',
           'и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p',
           'р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'ts','ч'=>'ch',
           'ш'=>'sh','щ'=>'sht','ъ'=>'a','ь'=>'','ю'=>'yu','я'=>'ya'];
    $s = strtr($s, $tr);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim($s, '-');
}
```

- [ ] **Step 2: Add update_brands_json function**

Add below `slugify`:

```php
function update_brands_json($data, $page) {
    $path = __DIR__ . '/brands.json';
    $entry = [
        'slug'       => slugify($data['brand_name'] ?? 'unnamed'),
        'name'       => $data['brand_name'] ?? '',
        'website'    => $data['website'] ?? '',
        'languages'  => array_map('trim', explode(',', $data['languages'] ?? '')),
        'notion_url' => $page['url'],
        'profile' => [
            'description'        => $data['brand_description'] ?? '',
            'customer_insights'  => $data['customer_insights'] ?? '',
            'desired_outcome'    => $data['desired_outcome'] ?? '',
            'why_us'             => $data['why_us'] ?? '',
            'differentiation'    => $data['differentiation'] ?? '',
            'usp'                => $data['usp'] ?? '',
            'hard_to_copy'       => $data['hard_to_copy'] ?? '',
            'one_sentence'       => $data['one_sentence'] ?? '',
        ],
        'guidelines' => [
            'raw'    => $data['brand_guidelines'] ?? '',
            'colors' => ['primary' => '', 'accent' => '', 'bg' => '#FFFFFF'],
            'fonts'  => ['heading' => '', 'body' => ''],
            'tone'   => '',
        ],
        'drive_link' => $data['drive_link'] ?? '',
        'approver'   => [
            'name'  => $data['approver_name'] ?? '',
            'email' => $data['approver_email'] ?? '',
        ],
        'updated_at' => date('c'),
    ];

    $fp = fopen($path, 'c+');
    if (!$fp) return;
    if (!flock($fp, LOCK_EX)) { fclose($fp); return; }

    $raw = stream_get_contents($fp);
    $doc = $raw ? json_decode($raw, true) : null;
    if (!$doc || !isset($doc['brands'])) {
        $doc = ['version' => 1, 'updated_at' => date('c'), 'brands' => []];
    }

    // Upsert by slug
    $found = false;
    foreach ($doc['brands'] as $i => $b) {
        if (($b['slug'] ?? '') === $entry['slug']) {
            $doc['brands'][$i] = $entry;
            $found = true;
            break;
        }
    }
    if (!$found) $doc['brands'][] = $entry;
    $doc['updated_at'] = date('c');

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($doc, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}
```

- [ ] **Step 3: Call update_brands_json after Notion creation**

In `create-portal.php`, find the line `// Notify Alex` and insert this just above it:

```php
update_brands_json($data, $page);
```

- [ ] **Step 4: Manual sanity check locally**

Run:
```bash
cd ~/stayhaus
php -l create-portal.php
```
Expected: `No syntax errors detected in create-portal.php`

- [ ] **Step 5: Commit**

```bash
cd ~/stayhaus
git add create-portal.php
git commit -m "feat(php): write brands.json on every onboarding submission"
git push
```

---

## Chunk 2: Plugin scaffolding

### Task 2: Plugin manifest, package.json, tsconfig

**Files:**
- Create: `composer/manifest.json`
- Create: `composer/package.json`
- Create: `composer/tsconfig.json`
- Create: `composer/build.mjs`
- Create: `composer/.gitignore`

- [ ] **Step 1: Create the composer directory and manifest**

```bash
mkdir -p ~/stayhaus/composer/src/lib
```

Write `composer/manifest.json`:
```json
{
  "name": "StayHaus Composer",
  "id": "stayhaus-composer",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "networkAccess": {
    "allowedDomains": ["https://stayhaus.eu"]
  }
}
```

- [ ] **Step 2: Write package.json**

```json
{
  "name": "stayhaus-composer",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@figma/plugin-typings": "^1.100.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["es2020", "dom"],
    "typeRoots": ["./node_modules/@figma", "./node_modules/@types"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Write build.mjs**

```javascript
import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

mkdirSync('dist', { recursive: true });

const watch = process.argv.includes('--watch');

const opts = {
  entryPoints: ['src/code.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2020',
  format: 'iife',
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(opts);
}

copyFileSync('src/ui.html', 'dist/ui.html');
console.log('Built dist/code.js and dist/ui.html');
```

- [ ] **Step 5: Write composer/.gitignore**

```
node_modules/
dist/
```

- [ ] **Step 6: Update root .gitignore**

Add to `~/stayhaus/.gitignore`:
```
composer/node_modules/
composer/dist/
```

- [ ] **Step 7: Install deps**

```bash
cd ~/stayhaus/composer && npm install
```
Expected: completes without errors, `node_modules/@figma/plugin-typings` exists.

- [ ] **Step 8: Commit**

```bash
cd ~/stayhaus
git add composer/manifest.json composer/package.json composer/tsconfig.json composer/build.mjs composer/.gitignore .gitignore
git commit -m "feat(composer): scaffold figma plugin (manifest, build, deps)"
git push
```

---

## Chunk 3: Plugin types + brands.json client

### Task 3: brands.ts module

**Files:**
- Create: `composer/src/lib/brands.ts`

- [ ] **Step 1: Write brands.ts**

```typescript
export interface Brand {
  slug: string;
  name: string;
  website: string;
  languages: string[];
  notion_url: string;
  profile: {
    description: string;
    customer_insights: string;
    desired_outcome: string;
    why_us: string;
    differentiation: string;
    usp: string;
    hard_to_copy: string;
    one_sentence: string;
  };
  guidelines: {
    raw: string;
    colors: { primary: string; accent: string; bg: string };
    fonts: { heading: string; body: string };
    tone: string;
  };
  drive_link: string;
  approver: { name: string; email: string };
  updated_at: string;
}

export interface BrandsDoc {
  version: number;
  updated_at: string;
  brands: Brand[];
}

const BRANDS_URL = 'https://stayhaus.eu/brands.json';

export async function fetchBrands(): Promise<Brand[]> {
  const res = await fetch(BRANDS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`brands.json fetch failed: ${res.status}`);
  const doc: BrandsDoc = await res.json();
  return doc.brands ?? [];
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/stayhaus/composer && npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/stayhaus
git add composer/src/lib/brands.ts
git commit -m "feat(composer): brands.json fetch + types"
git push
```

---

## Chunk 4: Plugin UI (single panel)

### Task 4: ui.html — the single-panel layout

**Files:**
- Create: `composer/src/ui.html`

- [ ] **Step 1: Write ui.html**

This is the visible plugin window. Single panel, dark theme, brand-on. The exact mockup we approved during brainstorming.

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root {
    --bg: #0A0118; --bg2: #0F0520; --card: #18023A; --line: #2B2338;
    --text: #fff; --muted: #9B96B0; --purple: #B47CFD; --pink: #FF7FC2;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  .panel { padding: 16px 18px; }
  .header { display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px; border-bottom: 1px solid var(--line); }
  .header .name { font-weight: 700; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: .18em;
    color: var(--muted); margin: 14px 0 6px; }
  select, input[type=text] { width: 100%; background: var(--card); color: var(--text);
    border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px;
    font: inherit; outline: none; }
  select:focus, input:focus { border-color: var(--purple); }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { background: var(--card); color: var(--muted); font-size: 11px;
    padding: 6px 11px; border-radius: 99px; cursor: pointer; border: 1px solid var(--line); }
  .chip.active { background: linear-gradient(90deg, var(--purple), var(--pink));
    color: var(--bg); font-weight: 700; border-color: transparent; }
  .section-row { background: var(--card); border: 1px solid var(--line);
    border-radius: 8px; padding: 9px 12px; margin-bottom: 6px;
    display: flex; justify-content: space-between; align-items: center; }
  .section-row select { width: auto; padding: 4px 8px; font-size: 11px; }
  button.primary { width: 100%; padding: 13px; border: 0; border-radius: 99px;
    background: linear-gradient(90deg, var(--purple), var(--pink));
    color: var(--bg); font-weight: 800; font-size: 13px; cursor: pointer;
    margin-top: 18px; }
  button.primary:disabled { opacity: .4; cursor: not-allowed; }
  .status { margin-top: 10px; font-size: 11px; color: var(--muted); text-align: center; min-height: 14px; }
  .status.error { color: var(--pink); }
</style>
</head>
<body>

<div class="header">
  <div class="name">StayHaus Composer</div>
  <div style="font-size: 11px; color: var(--muted)">v0.1</div>
</div>

<div class="panel">
  <div class="label">Brand</div>
  <select id="brand"><option>Loading...</option></select>

  <div class="label">Flow</div>
  <div class="chips" id="flows">
    <span class="chip active" data-flow="welcome">Welcome</span>
    <span class="chip" data-flow="cart">Cart</span>
    <span class="chip" data-flow="post-purchase">Post-Purchase</span>
    <span class="chip" data-flow="winback">Winback</span>
    <span class="chip" data-flow="browse">Browse</span>
  </div>

  <div class="label">Sections</div>
  <div id="sections">
    <div class="section-row">
      <span>Hero</span>
      <select data-section="hero"><option>v1</option><option>v2</option><option>v3</option></select>
    </div>
    <div class="section-row">
      <span>Body</span>
      <select data-section="body"><option>v1</option><option>v2</option></select>
    </div>
    <div class="section-row">
      <span>CTA</span>
      <select data-section="cta"><option>v1</option><option>v2</option></select>
    </div>
    <div class="section-row">
      <span>Footer</span>
      <select data-section="footer"><option>v1</option></select>
    </div>
  </div>

  <div class="label">Offer (free text)</div>
  <input id="offer" type="text" placeholder="e.g. 20% off, ends Sunday" />

  <button id="generate" class="primary" disabled>Generate →</button>
  <div class="status" id="status">Loading brands...</div>
</div>

<script>
  const $ = (sel) => document.querySelector(sel);
  const status = $('#status');
  let brands = [];
  let activeFlow = 'welcome';

  // Fetch brands.json on load (the plugin sandbox can't fetch directly,
  // so the UI does it — networkAccess in manifest allows stayhaus.eu)
  fetch('https://stayhaus.eu/brands.json', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(doc => {
      brands = doc.brands || [];
      const sel = $('#brand');
      sel.innerHTML = brands.map(b => `<option value="${b.slug}">${b.name}</option>`).join('');
      $('#generate').disabled = brands.length === 0;
      status.textContent = `${brands.length} brand${brands.length === 1 ? '' : 's'} loaded`;
    })
    .catch(err => {
      status.textContent = `Can't reach stayhaus.eu (${err}).`;
      status.classList.add('error');
    });

  // Flow chip selection
  document.querySelectorAll('#flows .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#flows .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFlow = chip.dataset.flow;
    });
  });

  // Generate button
  $('#generate').addEventListener('click', () => {
    const brandSlug = $('#brand').value;
    const brand = brands.find(b => b.slug === brandSlug);
    if (!brand) return;

    const sections = Array.from(document.querySelectorAll('[data-section]'))
      .map(s => ({ section: s.dataset.section, variant: s.value }));

    const offer = $('#offer').value.trim();

    parent.postMessage({
      pluginMessage: { type: 'generate', brand, flow: activeFlow, sections, offer }
    }, '*');

    status.textContent = 'Generating...';
    status.classList.remove('error');
  });

  // Listen for messages from the plugin sandbox
  window.onmessage = (e) => {
    const msg = e.data.pluginMessage;
    if (!msg) return;
    if (msg.type === 'done') {
      status.textContent = msg.text || 'Done.';
      status.classList.remove('error');
    } else if (msg.type === 'error') {
      status.textContent = msg.text || 'Error.';
      status.classList.add('error');
    }
  };
</script>
</body>
</html>
```

- [ ] **Step 2: Build and verify dist exists**

```bash
cd ~/stayhaus/composer && npm run build
```
Expected: `dist/ui.html` and `dist/code.js` exist (code.js will be empty/stub until next chunk).

- [ ] **Step 3: Commit**

```bash
cd ~/stayhaus
git add composer/src/ui.html
git commit -m "feat(composer): single-panel UI with brand picker and chips"
git push
```

---

## Chunk 5: Plugin sandbox (code.ts) — message handler + library reader + compose

### Task 5: library.ts — read components from team library

**Files:**
- Create: `composer/src/lib/library.ts`

The plugin sandbox can read components imported into the active file from a team library. The convention: components are named like `welcome/hero/v2`, organized in pages by flow. To find one, we walk all imported components and match the name.

- [ ] **Step 1: Write library.ts**

```typescript
/**
 * Find a component in the team library by name pattern.
 * Master template components must be named: "<flow>/<section>/<variant>"
 * e.g., "welcome/hero/v2"
 *
 * Designer must drag at least one instance of each component into the
 * file once so it's "imported" — Figma plugins can only resolve components
 * already known to the file. (Phase 2b will switch to the team library API
 * once we have a Figma access token.)
 */
export async function findComponent(
  flow: string,
  section: string,
  variant: string
): Promise<ComponentNode | null> {
  const targetName = `${flow}/${section}/${variant}`;
  const all = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });
  for (const node of all) {
    if (node.name === targetName) return node as ComponentNode;
  }
  return null;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/stayhaus/composer && npm run typecheck
```
Expected: no errors.

### Task 6: compose.ts — clone components, apply brand styling

**Files:**
- Create: `composer/src/lib/compose.ts`

- [ ] **Step 1: Write compose.ts**

```typescript
import type { Brand } from './brands';
import { findComponent } from './library';

export interface SectionPick {
  section: string;
  variant: string;
}

export interface ComposeInput {
  brand: Brand;
  flow: string;
  sections: SectionPick[];
  offer: string;
}

/**
 * Walk a node and apply brand styling:
 * - For text nodes: swap font to brand heading/body
 * - For nodes bound to BRAND_PRIMARY/ACCENT/BG variables: rebind to overrides
 *
 * In 2a we apply font and color naively. Sophisticated variable binding
 * comes in a later iteration.
 */
async function applyBrandStyling(node: SceneNode, brand: Brand): Promise<void> {
  if ('children' in node) {
    for (const child of node.children) await applyBrandStyling(child, brand);
  }

  if (node.type === 'TEXT') {
    const text = node as TextNode;
    const isHeading = /HEADLINE|SUBHEAD|CTA_LABEL|OFFER_TEXT/i.test(text.name);
    const fontFamily = isHeading
      ? brand.guidelines.fonts.heading || 'Inter'
      : brand.guidelines.fonts.body || 'Inter';

    try {
      await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
      // Replace all font assignments in the text
      const len = text.characters.length;
      if (len > 0) {
        text.setRangeFontName(0, len, { family: fontFamily, style: 'Regular' });
      }
    } catch (e) {
      // Font not available — silently skip; designer sees default
    }
  }
}

export async function compose(input: ComposeInput): Promise<FrameNode> {
  const { brand, flow, sections, offer } = input;

  // Create the wrapper frame
  const frame = figma.createFrame();
  frame.name = `${brand.slug} / ${flow} / BG`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 0;
  frame.fills = [];

  let missing: string[] = [];

  for (const pick of sections) {
    const component = await findComponent(flow, pick.section, pick.variant);
    if (!component) {
      missing.push(`${flow}/${pick.section}/${pick.variant}`);
      continue;
    }
    const instance = component.createInstance();
    frame.appendChild(instance);
    await applyBrandStyling(instance, brand);

    // If this is a hero or cta, set the OFFER_TEXT layer to the typed offer
    if (offer) {
      const offerLayer = (instance.findAll(n => n.name === 'OFFER_TEXT' && n.type === 'TEXT')[0]) as TextNode | undefined;
      if (offerLayer) {
        try {
          await figma.loadFontAsync(offerLayer.fontName as FontName);
          offerLayer.characters = offer;
        } catch {}
      }
    }
  }

  // Position frame in viewport
  frame.x = figma.viewport.center.x - frame.width / 2;
  frame.y = figma.viewport.center.y - frame.height / 2;
  figma.currentPage.appendChild(frame);
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);

  if (missing.length > 0) {
    figma.notify(`Missing variants: ${missing.join(', ')}`, { error: true });
  }

  return frame;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/stayhaus/composer && npm run typecheck
```
Expected: no errors.

### Task 7: code.ts — plugin entry, message handler

**Files:**
- Create: `composer/src/code.ts`

- [ ] **Step 1: Write code.ts**

```typescript
import { compose } from './lib/compose';
import type { Brand } from './lib/brands';

figma.showUI(__html__, { width: 360, height: 640, themeColors: false });

figma.ui.onmessage = async (msg: { type: string } & Record<string, unknown>) => {
  if (msg.type === 'generate') {
    try {
      const frame = await compose({
        brand: msg.brand as Brand,
        flow: msg.flow as string,
        sections: msg.sections as { section: string; variant: string }[],
        offer: (msg.offer as string) || '',
      });
      figma.ui.postMessage({ type: 'done', text: `Created ${frame.name}` });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      figma.ui.postMessage({ type: 'error', text: err });
      figma.notify(`Composer error: ${err}`, { error: true });
    }
  }
};
```

- [ ] **Step 2: Build**

```bash
cd ~/stayhaus/composer && npm run build
```
Expected: `dist/code.js` non-empty, `dist/ui.html` present, no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/stayhaus
git add composer/src/code.ts composer/src/lib/library.ts composer/src/lib/compose.ts
git commit -m "feat(composer): plugin sandbox — message handler, library reader, compose logic"
git push
```

---

## Chunk 6: Local dev README

### Task 8: composer/README.md

**Files:**
- Create: `composer/README.md`

- [ ] **Step 1: Write README**

```markdown
# StayHaus Composer (Figma plugin)

Phase 2a foundation. Picks a brand, picks Welcome flow + sections, clones brand-styled section components from the StayHaus Master Templates Figma file into the active file.

## Setup

```bash
cd composer
npm install
npm run build
```

## Load in Figma

1. Open Figma desktop app (web doesn't allow local plugins)
2. Menu: Plugins → Development → Import plugin from manifest
3. Choose `composer/manifest.json`
4. Open any Figma file. Plugins → Development → StayHaus Composer

## Prerequisites

- The "StayHaus Master Templates" Figma file must be shared as a Team Library, and at least one instance of each needed component must already be present in the current Figma file (so the plugin can resolve them by name). This limitation goes away in Phase 2b.
- Components must be named `<flow>/<section>/<variant>`, e.g. `welcome/hero/v2`.
- `https://stayhaus.eu/brands.json` must be reachable.

## Develop

```bash
npm run watch   # rebuild on save
```

After each change, in Figma: Plugins → Development → StayHaus Composer → close and reopen the plugin window (Figma reloads `dist/`).
```

- [ ] **Step 2: Commit**

```bash
cd ~/stayhaus
git add composer/README.md
git commit -m "docs(composer): local dev + figma load instructions"
git push
```

---

## Chunk 7: Manual validation against a fixture

### Task 9: End-to-end manual test

This is the only "test" in 2a — proper automated tests start in 2b once we mock OpenAI.

- [ ] **Step 1: Verify brands.json is reachable in production**

Once Alex deploys the updated `create-portal.php`:
```bash
curl -s https://stayhaus.eu/brands.json | head -40
```
Expected: JSON document with `brands` array containing at least the test lead.

- [ ] **Step 2: Open the StayHaus Master Templates Figma file (provided by Valentin/Alex)**

Verify it has:
- A page named "Welcome Flow"
- Components named `welcome/hero/v1`, `welcome/hero/v2`, `welcome/body/v1`, `welcome/cta/v1`, `welcome/footer/v1` (at minimum)
- All components use auto-layout
- Layers inside named per spec convention (`HEADLINE`, `BODY`, etc.)
- Three Figma color variables defined: `BRAND_PRIMARY`, `BRAND_ACCENT`, `BRAND_BG`

- [ ] **Step 3: Open a fresh Figma file and import the plugin**

Plugins → Development → Import plugin from manifest → `composer/manifest.json`

- [ ] **Step 4: Run the plugin**

Plugins → Development → StayHaus Composer.
Verify:
- Brand dropdown loads from `brands.json` with at least one entry
- Status text says "N brands loaded"
- Picking a brand, leaving Welcome flow active, default sections, typing "20% off, ends Sunday" in the offer field, clicking Generate produces a new frame named `<slug>/welcome/BG` containing the cloned section components, with brand fonts applied where defined
- The OFFER_TEXT layer (if present in the master template) shows "20% off, ends Sunday"

- [ ] **Step 5: Hand off bug list (if any) and close out 2a**

Document any failing items in a follow-up issue. If everything passes:

```bash
cd ~/stayhaus
git tag composer-2a-shipped
git push --tags
```

---

## Phase 2a done

After Task 9 passes, Phase 2a is shipped. Next: write the Phase 2b plan (OpenAI copy generation).
