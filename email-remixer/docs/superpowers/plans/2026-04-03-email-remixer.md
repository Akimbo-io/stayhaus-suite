# Email Remixer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tool that fetches marketing emails from Gmail, parses them into structured JSON, and imports them into Figma as fully editable layers via a Figma plugin.

**Architecture:** Two independent components connected by a JSON bridge format. A Node.js parser script fetches emails via Gmail OAuth2 and converts HTML into structured JSON with base64-encoded images. A Figma plugin reads that JSON and creates editable frames, text nodes, and image fills on the canvas.

**Tech Stack:** Node.js, googleapis, cheerio, node-fetch, sharp (image processing), esbuild, Figma Plugin API (TypeScript)

**Spec:** `docs/superpowers/specs/2026-04-03-email-remixer-design.md`

---

## File Structure

```
~/email-remixer/
  credentials.json              -- Gmail OAuth (already exists)
  package.json                  -- Root deps: googleapis, cheerio, node-fetch, sharp
  config.json                   -- Sender list, output dir
  src/
    auth.js                     -- Gmail OAuth2 authentication + token management
    gmail.js                    -- Fetch emails from Gmail API
    parser.js                   -- HTML-to-JSON conversion (cheerio)
    images.js                   -- Image downloading, base64 encoding, resizing
    ledger.js                   -- Track processed message IDs with 90-day pruning
    status.js                   -- Write last-run-status.json
    index.js                    -- Main entry point, orchestrates the pipeline
  tests/
    auth.test.js                -- Auth tests
    gmail.test.js               -- Gmail fetch tests
    parser.test.js              -- HTML parsing tests
    images.test.js              -- Image handling tests
    ledger.test.js              -- Ledger tests
    integration.test.js         -- End-to-end with sample email HTML
  output/                       -- Parsed JSON files land here
  logs/                         -- Cron logs
  email-remixer-plugin/
    manifest.json               -- Figma plugin manifest
    package.json                -- Plugin deps: esbuild, typescript, @figma/plugin-typings
    tsconfig.json               -- TypeScript config
    src/
      code.ts                   -- Plugin backend: reads JSON, creates Figma nodes
      ui.html                   -- Plugin UI: file picker
    dist/
      code.js                   -- Bundled output
```

---

## Chunk 1: Project Setup + Gmail Auth

### Task 1: Initialize Node.js project

**Files:**
- Create: `package.json`
- Create: `config.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize project**

```bash
cd ~/email-remixer
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install googleapis cheerio node-fetch@2 sharp
npm install --save-dev vitest
```

Note: `node-fetch@2` for CommonJS compat. `sharp` for image resizing.

- [ ] **Step 3: Create config.json**

```json
{
  "senders": ["support@hears.com"],
  "outputDir": "./output",
  "processedLedger": "./processed.json"
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
credentials.json
token.json
processed.json
last-run-status.json
output/
logs/
email-remixer-plugin/dist/
email-remixer-plugin/node_modules/
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p src tests output logs
```

- [ ] **Step 6: Add test script to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "start": "node src/index.js"
  }
}
```

- [ ] **Step 7: Commit**

```bash
git init
git add package.json config.json .gitignore
git commit -m "chore: initialize email-remixer project"
```

---

### Task 2: Gmail OAuth authentication module

**Files:**
- Create: `src/auth.js`
- Create: `tests/auth.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/auth.test.js
import { describe, it, expect, vi } from 'vitest';
import { createAuthClient, loadToken, saveToken } from '../src/auth.js';
import fs from 'fs';

vi.mock('fs');

describe('auth', () => {
  describe('loadToken', () => {
    it('returns null when token.json does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const token = loadToken('./token.json');
      expect(token).toBeNull();
    });

    it('returns parsed token when token.json exists', () => {
      const mockToken = { access_token: 'abc', refresh_token: 'def' };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockToken));
      const token = loadToken('./token.json');
      expect(token).toEqual(mockToken);
    });
  });

  describe('saveToken', () => {
    it('writes token to file', () => {
      const mockToken = { access_token: 'abc', refresh_token: 'def' };
      saveToken('./token.json', mockToken);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        './token.json',
        JSON.stringify(mockToken, null, 2)
      );
    });
  });

  describe('createAuthClient', () => {
    it('creates an OAuth2 client from credentials', () => {
      const creds = {
        installed: {
          client_id: 'test-id',
          client_secret: 'test-secret',
          redirect_uris: ['http://localhost']
        }
      };
      const client = createAuthClient(creds);
      expect(client).toBeDefined();
      expect(client.generateAuthUrl).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth.test.js`
Expected: FAIL with "cannot find module '../src/auth.js'"

- [ ] **Step 3: Write minimal implementation**

```js
// src/auth.js
const { google } = require('googleapis');
const fs = require('fs');
const http = require('http');
const url = require('url');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function createAuthClient(credentials) {
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

function loadToken(tokenPath) {
  if (!fs.existsSync(tokenPath)) return null;
  const raw = fs.readFileSync(tokenPath, 'utf-8');
  return JSON.parse(raw);
}

function saveToken(tokenPath, token) {
  fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));
}

async function authenticate(credentialsPath, tokenPath) {
  const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
  const client = createAuthClient(creds);

  const existingToken = loadToken(tokenPath);
  if (existingToken) {
    client.setCredentials(existingToken);
    client.on('tokens', (newTokens) => {
      const merged = { ...existingToken, ...newTokens };
      saveToken(tokenPath, merged);
    });
    return client;
  }

  // First-run: open browser for consent
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('Open this URL in your browser:\n', authUrl);

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const query = url.parse(req.url, true).query;
      if (query.code) {
        res.end('Authentication successful. You can close this tab.');
        server.close();
        resolve(query.code);
      } else {
        res.end('No code found.');
      }
    });
    server.listen(3000, () => {
      console.log('Waiting for auth callback on http://localhost:3000...');
    });
    setTimeout(() => { server.close(); reject(new Error('Auth timeout')); }, 120000);
  });

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  saveToken(tokenPath, tokens);
  return client;
}

module.exports = { createAuthClient, loadToken, saveToken, authenticate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth.js tests/auth.test.js
git commit -m "feat: add Gmail OAuth2 authentication module"
```

---

### Task 3: Gmail email fetching module

**Files:**
- Create: `src/gmail.js`
- Create: `tests/gmail.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/gmail.test.js
import { describe, it, expect, vi } from 'vitest';
import { fetchEmailsFromSender, extractHtmlBody } from '../src/gmail.js';

describe('gmail', () => {
  describe('extractHtmlBody', () => {
    it('extracts HTML from a simple single-part message', () => {
      const payload = {
        mimeType: 'text/html',
        body: {
          data: Buffer.from('<html><body>Hello</body></html>').toString('base64url')
        },
        parts: []
      };
      const html = extractHtmlBody(payload);
      expect(html).toContain('<body>Hello</body>');
    });

    it('extracts HTML from multipart/alternative', () => {
      const payload = {
        mimeType: 'multipart/alternative',
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from('plain text').toString('base64url') }
          },
          {
            mimeType: 'text/html',
            body: { data: Buffer.from('<html><body>Rich</body></html>').toString('base64url') }
          }
        ]
      };
      const html = extractHtmlBody(payload);
      expect(html).toContain('<body>Rich</body>');
    });

    it('extracts HTML from nested multipart/related > multipart/alternative', () => {
      const payload = {
        mimeType: 'multipart/related',
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              {
                mimeType: 'text/plain',
                body: { data: Buffer.from('plain').toString('base64url') }
              },
              {
                mimeType: 'text/html',
                body: { data: Buffer.from('<html><body>Nested</body></html>').toString('base64url') }
              }
            ]
          }
        ]
      };
      const html = extractHtmlBody(payload);
      expect(html).toContain('<body>Nested</body>');
    });

    it('returns null when no HTML part found', () => {
      const payload = {
        mimeType: 'text/plain',
        body: { data: Buffer.from('only plain').toString('base64url') },
        parts: []
      };
      const html = extractHtmlBody(payload);
      expect(html).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gmail.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```js
// src/gmail.js
const { google } = require('googleapis');

function decodeBase64Url(data) {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function extractHtmlBody(payload) {
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    // Prefer text/html in multipart
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith('multipart/')) {
        const result = extractHtmlBody(part);
        if (result) return result;
      }
    }
  }

  return null;
}

function extractInlineImages(payload) {
  const images = {};
  function walk(part) {
    if (part.headers) {
      const cidHeader = part.headers.find(h => h.name.toLowerCase() === 'content-id');
      if (cidHeader && part.body?.attachmentId) {
        const cid = cidHeader.value.replace(/[<>]/g, '');
        images[cid] = part.body.attachmentId;
      }
    }
    if (part.parts) part.parts.forEach(walk);
  }
  walk(payload);
  return images;
}

async function fetchEmailsFromSender(auth, senderEmail, maxResults = 20) {
  const gmail = google.gmail({ version: 'v1', auth });

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `from:${senderEmail}`,
    maxResults,
  });

  const messages = res.data.messages || [];
  const fullMessages = [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });
    fullMessages.push(full.data);
  }

  return fullMessages;
}

async function getAttachment(auth, messageId, attachmentId) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  return res.data.data; // base64url-encoded
}

module.exports = {
  fetchEmailsFromSender,
  extractHtmlBody,
  extractInlineImages,
  getAttachment,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gmail.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/gmail.js tests/gmail.test.js
git commit -m "feat: add Gmail email fetching and HTML extraction"
```

---

## Chunk 2: HTML Parser + Image Handling

### Task 4: HTML-to-JSON parser module

**Files:**
- Create: `src/parser.js`
- Create: `tests/parser.test.js`
- Create: `tests/fixtures/simple-email.html`
- Create: `tests/fixtures/two-column-email.html`

- [ ] **Step 1: Create test fixture -- simple email HTML**

```html
<!-- tests/fixtures/simple-email.html -->
<html>
<body>
<table width="600" align="center" style="background-color: #ffffff;">
  <tr>
    <td>
      <img src="https://example.com/hero.jpg" width="600" height="300" alt="Hero">
    </td>
  </tr>
  <tr>
    <td style="font-size: 32px; font-weight: bold; color: #1a1a1a; text-align: center; line-height: 1.2;">
      Spring Collection
    </td>
  </tr>
  <tr>
    <td style="font-size: 16px; color: #666666; text-align: center;">
      Check out our latest arrivals
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://example.com/shop" style="background-color: #e63946; color: #ffffff; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
        Shop Now
      </a>
    </td>
  </tr>
</table>
</body>
</html>
```

- [ ] **Step 2: Create test fixture -- two-column email HTML**

```html
<!-- tests/fixtures/two-column-email.html -->
<html>
<body>
<table width="600" align="center">
  <tr>
    <td width="300" style="font-size: 14px; color: #333333;">Left column text</td>
    <td width="300" style="font-size: 14px; color: #333333;">Right column text</td>
  </tr>
</table>
</body>
</html>
```

- [ ] **Step 3: Write the failing test**

```js
// tests/parser.test.js
import { describe, it, expect } from 'vitest';
import { parseEmailHtml } from '../src/parser.js';
import fs from 'fs';
import path from 'path';

const readFixture = (name) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');

describe('parser', () => {
  describe('parseEmailHtml', () => {
    it('parses a simple email into structured elements', () => {
      const html = readFixture('simple-email.html');
      const result = parseEmailHtml(html);

      expect(result.schemaVersion).toBe(1);
      expect(result.width).toBe(600);
      expect(result.elements.length).toBeGreaterThan(0);

      // Should find an image element
      const img = result.elements.flat(Infinity)
        .find ? undefined : null;
      // Flatten nested sections to find elements
      const allElements = flattenElements(result.elements);

      const images = allElements.filter(e => e.type === 'image');
      expect(images.length).toBe(1);
      expect(images[0].src).toBe('https://example.com/hero.jpg');
      expect(images[0].width).toBe(600);

      const texts = allElements.filter(e => e.type === 'text');
      expect(texts.length).toBeGreaterThanOrEqual(2);
      expect(texts.some(t => t.content.includes('Spring Collection'))).toBe(true);
      expect(texts.some(t => t.fontSize === 32)).toBe(true);

      const buttons = allElements.filter(e => e.type === 'button');
      expect(buttons.length).toBe(1);
      expect(buttons[0].label).toBe('Shop Now');
      expect(buttons[0].bgColor).toBe('#e63946');
    });

    it('detects horizontal layout from multi-cell rows', () => {
      const html = readFixture('two-column-email.html');
      const result = parseEmailHtml(html);
      const allElements = flattenElements(result.elements);

      const horizontalSections = allElements.filter(
        e => e.type === 'section' && e.direction === 'horizontal'
      );
      expect(horizontalSections.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty elements for empty HTML', () => {
      const result = parseEmailHtml('<html><body></body></html>');
      expect(result.elements).toEqual([]);
    });
  });
});

// Helper to flatten nested section children
function flattenElements(elements) {
  const result = [];
  for (const el of elements) {
    result.push(el);
    if (el.children) {
      result.push(...flattenElements(el.children));
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/parser.test.js`
Expected: FAIL

- [ ] **Step 5: Write implementation**

```js
// src/parser.js
const cheerio = require('cheerio');

function parseEmailHtml(html) {
  const $ = cheerio.load(html);
  const elements = [];

  // Find the main content table (usually width="600" or centered)
  let mainTable = $('table[width="600"], table[align="center"]').first();
  if (!mainTable.length) mainTable = $('table').first();

  const width = parseInt(mainTable.attr('width')) || 600;

  if (mainTable.length) {
    const children = parseTable($, mainTable);
    elements.push(...children);
  }

  return { schemaVersion: 1, width, elements };
}

function parseTable($, table) {
  const elements = [];
  const rows = table.children('tbody, tr').length
    ? (table.children('tbody').length
      ? table.children('tbody').children('tr')
      : table.children('tr'))
    : table.find('> tr');

  rows.each((_, row) => {
    const cells = $(row).children('td, th');

    if (cells.length > 1) {
      // Horizontal layout
      const children = [];
      cells.each((_, cell) => {
        const cellElements = parseCell($, $(cell));
        const cellWidth = parseInt($(cell).attr('width')) || undefined;
        children.push({
          type: 'section',
          direction: 'vertical',
          width: cellWidth,
          bgColor: parseStyle($(cell).attr('style'), 'background-color'),
          padding: parsePadding($(cell).attr('style')),
          children: cellElements,
        });
      });
      elements.push({
        type: 'section',
        direction: 'horizontal',
        children,
      });
    } else if (cells.length === 1) {
      const cellElements = parseCell($, cells.first());
      elements.push(...cellElements);
    }
  });

  return elements;
}

function parseCell($, cell) {
  const elements = [];

  // Check for nested tables
  const nestedTables = cell.children('table');
  if (nestedTables.length) {
    nestedTables.each((_, t) => {
      const children = parseTable($, $(t));
      elements.push({
        type: 'section',
        direction: 'vertical',
        bgColor: parseStyle($(t).attr('style'), 'background-color'),
        padding: parsePadding($(t).attr('style')),
        children,
      });
    });
    return elements;
  }

  // Process direct content
  cell.contents().each((_, node) => {
    if (node.type === 'text') {
      const text = $(node).text().trim();
      if (text) {
        const style = cell.attr('style') || '';
        elements.push(createTextElement(text, style));
      }
    } else if (node.type === 'tag') {
      const el = $(node);
      const tag = node.tagName.toLowerCase();

      if (tag === 'img') {
        elements.push({
          type: 'image',
          src: el.attr('src') || '',
          width: parseInt(el.attr('width')) || undefined,
          height: parseInt(el.attr('height')) || undefined,
        });
      } else if (tag === 'a' && isButtonLike(el)) {
        elements.push(createButtonElement(el));
      } else if (tag === 'a') {
        const text = el.text().trim();
        if (text) {
          const style = el.attr('style') || cell.attr('style') || '';
          const textEl = createTextElement(text, style);
          textEl.href = el.attr('href');
          elements.push(textEl);
        }
      } else if (tag === 'table') {
        const children = parseTable($, el);
        elements.push({
          type: 'section',
          direction: 'vertical',
          children,
        });
      } else if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div'].includes(tag)) {
        // Check for images inside
        const imgs = el.find('img');
        imgs.each((_, img) => {
          const imgEl = $(img);
          elements.push({
            type: 'image',
            src: imgEl.attr('src') || '',
            width: parseInt(imgEl.attr('width')) || undefined,
            height: parseInt(imgEl.attr('height')) || undefined,
          });
        });

        // Check for button-like links inside
        const links = el.find('a');
        let hasButton = false;
        links.each((_, link) => {
          if (isButtonLike($(link))) {
            elements.push(createButtonElement($(link)));
            hasButton = true;
          }
        });

        if (!hasButton) {
          const text = el.text().trim();
          if (text) {
            const style = el.attr('style') || cell.attr('style') || '';
            const defaultSize = getDefaultFontSize(tag);
            const defaultWeight = tag.startsWith('h') ? 'bold' : undefined;
            const textEl = createTextElement(text, style, defaultSize, defaultWeight);
            elements.push(textEl);
          }
        }
      } else if (tag === 'hr') {
        elements.push({
          type: 'divider',
          color: parseStyle(el.attr('style'), 'border-color') || '#cccccc',
          thickness: parseInt(parseStyle(el.attr('style'), 'border-width')) || 1,
        });
      }
    }
  });

  return elements;
}

function isButtonLike(el) {
  const style = el.attr('style') || '';
  return (
    style.includes('background-color') &&
    (style.includes('padding') || style.includes('border-radius') || style.includes('display'))
  );
}

function createButtonElement(el) {
  const style = el.attr('style') || '';
  return {
    type: 'button',
    label: el.text().trim(),
    fontSize: parseInt(parseStyle(style, 'font-size')) || 14,
    color: parseStyle(style, 'color') || '#ffffff',
    bgColor: parseStyle(style, 'background-color') || '#333333',
    borderRadius: parseInt(parseStyle(style, 'border-radius')) || 4,
    href: el.attr('href') || '',
  };
}

function createTextElement(content, style, defaultSize, defaultWeight) {
  return {
    type: 'text',
    content,
    fontSize: parseInt(parseStyle(style, 'font-size')) || defaultSize || 16,
    fontWeight: parseStyle(style, 'font-weight') || defaultWeight || 'normal',
    color: parseStyle(style, 'color') || '#000000',
    align: parseStyle(style, 'text-align') || 'left',
    lineHeight: parseFloat(parseStyle(style, 'line-height')) || undefined,
    letterSpacing: parseFloat(parseStyle(style, 'letter-spacing')) || undefined,
  };
}

function getDefaultFontSize(tag) {
  const sizes = { h1: 32, h2: 28, h3: 24, h4: 20, h5: 18, h6: 16 };
  return sizes[tag] || 16;
}

function parseStyle(style, property) {
  if (!style) return undefined;
  const regex = new RegExp(`${property}\\s*:\\s*([^;]+)`);
  const match = style.match(regex);
  return match ? match[1].trim() : undefined;
}

function parsePadding(style) {
  const raw = parseStyle(style, 'padding');
  if (!raw) return undefined;
  const parts = raw.split(/\s+/).map(p => parseInt(p) || 0);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 4) return parts;
  return undefined;
}

module.exports = { parseEmailHtml };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/parser.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/parser.js tests/parser.test.js tests/fixtures/
git commit -m "feat: add HTML-to-JSON email parser"
```

---

### Task 5: Image handling module

**Files:**
- Create: `src/images.js`
- Create: `tests/images.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/images.test.js
import { describe, it, expect, vi } from 'vitest';
import { resolveImageSrc, isOversized, IMAGE_MAX_WIDTH, IMAGE_MAX_BYTES } from '../src/images.js';

describe('images', () => {
  describe('resolveImageSrc', () => {
    it('replaces cid: references with inline image data', () => {
      const cidMap = { 'logo123': 'base64data_here' };
      const result = resolveImageSrc('cid:logo123', cidMap);
      expect(result.type).toBe('inline');
      expect(result.data).toBe('base64data_here');
    });

    it('returns url type for http images', () => {
      const result = resolveImageSrc('https://example.com/img.jpg', {});
      expect(result.type).toBe('url');
      expect(result.url).toBe('https://example.com/img.jpg');
    });

    it('returns null for data: URIs', () => {
      const result = resolveImageSrc('data:image/gif;base64,R0lGOD...', {});
      expect(result.type).toBe('data');
    });
  });

  describe('isOversized', () => {
    it('returns true for buffers over IMAGE_MAX_BYTES', () => {
      const big = Buffer.alloc(IMAGE_MAX_BYTES + 1);
      expect(isOversized(big)).toBe(true);
    });

    it('returns false for small buffers', () => {
      const small = Buffer.alloc(100);
      expect(isOversized(small)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/images.test.js`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```js
// src/images.js
const fetch = require('node-fetch');
const sharp = require('sharp');

const IMAGE_MAX_WIDTH = 1200;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024; // 4MB Figma limit

function resolveImageSrc(src, cidMap) {
  if (!src) return null;

  if (src.startsWith('cid:')) {
    const cid = src.replace('cid:', '');
    const data = cidMap[cid];
    if (data) return { type: 'inline', data };
    return null;
  }

  if (src.startsWith('data:')) {
    return { type: 'data', data: src };
  }

  if (src.startsWith('http://') || src.startsWith('https://')) {
    return { type: 'url', url: src };
  }

  return null;
}

function isOversized(buffer) {
  return buffer.length > IMAGE_MAX_BYTES;
}

async function downloadAndEncodeImage(src, cidMap) {
  const resolved = resolveImageSrc(src, cidMap);
  if (!resolved) return null;

  try {
    let buffer;

    if (resolved.type === 'url') {
      const res = await fetch(resolved.url, { timeout: 10000 });
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
    } else if (resolved.type === 'inline') {
      buffer = Buffer.from(resolved.data, 'base64url');
    } else if (resolved.type === 'data') {
      const match = resolved.data.match(/^data:[^;]+;base64,(.+)$/);
      if (match) buffer = Buffer.from(match[1], 'base64');
      else return null;
    }

    if (!buffer || buffer.length === 0) return null;

    // Resize if too wide
    const metadata = await sharp(buffer).metadata();
    if (metadata.width > IMAGE_MAX_WIDTH) {
      buffer = await sharp(buffer)
        .resize({ width: IMAGE_MAX_WIDTH })
        .toBuffer();
    }

    // Skip if still over Figma limit
    if (isOversized(buffer)) return null;

    const base64 = buffer.toString('base64');
    const mime = metadata.format === 'png' ? 'image/png' : 'image/jpeg';
    return {
      base64: `data:${mime};base64,${base64}`,
      width: Math.min(metadata.width, IMAGE_MAX_WIDTH),
      height: metadata.width > IMAGE_MAX_WIDTH
        ? Math.round(metadata.height * (IMAGE_MAX_WIDTH / metadata.width))
        : metadata.height,
    };
  } catch (err) {
    console.error(`Failed to process image ${src}:`, err.message);
    return null;
  }
}

module.exports = {
  resolveImageSrc,
  isOversized,
  downloadAndEncodeImage,
  IMAGE_MAX_WIDTH,
  IMAGE_MAX_BYTES,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/images.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/images.js tests/images.test.js
git commit -m "feat: add image downloading, resizing, and base64 encoding"
```

---

### Task 6: Ledger and status modules

**Files:**
- Create: `src/ledger.js`
- Create: `src/status.js`
- Create: `tests/ledger.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/ledger.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadLedger, saveLedger, isProcessed, markProcessed, pruneOldEntries } from '../src/ledger.js';
import fs from 'fs';

vi.mock('fs');

describe('ledger', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('loadLedger', () => {
    it('returns empty array when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const ledger = loadLedger('./processed.json');
      expect(ledger).toEqual([]);
    });

    it('returns parsed entries when file exists', () => {
      const data = { processedIds: [{ id: 'a', date: '2026-04-01' }] };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(data));
      const ledger = loadLedger('./processed.json');
      expect(ledger).toEqual([{ id: 'a', date: '2026-04-01' }]);
    });
  });

  describe('isProcessed', () => {
    it('returns true if message ID is in ledger', () => {
      const ledger = [{ id: 'abc', date: '2026-04-01' }];
      expect(isProcessed(ledger, 'abc')).toBe(true);
    });

    it('returns false if message ID is not in ledger', () => {
      const ledger = [{ id: 'abc', date: '2026-04-01' }];
      expect(isProcessed(ledger, 'xyz')).toBe(false);
    });
  });

  describe('pruneOldEntries', () => {
    it('removes entries older than 90 days', () => {
      const now = new Date('2026-04-03');
      const ledger = [
        { id: 'old', date: '2025-12-01' },
        { id: 'recent', date: '2026-03-15' },
      ];
      const pruned = pruneOldEntries(ledger, now);
      expect(pruned).toEqual([{ id: 'recent', date: '2026-03-15' }]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ledger.test.js`
Expected: FAIL

- [ ] **Step 3: Write ledger implementation**

```js
// src/ledger.js
const fs = require('fs');

function loadLedger(path) {
  if (!fs.existsSync(path)) return [];
  const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
  return data.processedIds || [];
}

function saveLedger(path, entries) {
  fs.writeFileSync(path, JSON.stringify({ processedIds: entries }, null, 2));
}

function isProcessed(ledger, messageId) {
  return ledger.some(entry => entry.id === messageId);
}

function markProcessed(ledger, messageId, date) {
  ledger.push({ id: messageId, date: date || new Date().toISOString().slice(0, 10) });
  return ledger;
}

function pruneOldEntries(ledger, now) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 90);
  return ledger.filter(entry => new Date(entry.date) >= cutoff);
}

module.exports = { loadLedger, saveLedger, isProcessed, markProcessed, pruneOldEntries };
```

- [ ] **Step 4: Write status module**

```js
// src/status.js
const fs = require('fs');

function writeStatus(path, status) {
  fs.writeFileSync(path, JSON.stringify({
    ...status,
    timestamp: new Date().toISOString(),
  }, null, 2));
}

module.exports = { writeStatus };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/ledger.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ledger.js src/status.js tests/ledger.test.js
git commit -m "feat: add processed email ledger with pruning and run status"
```

---

## Chunk 3: Main Pipeline + Integration Test

### Task 7: Main orchestrator (index.js)

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: Write implementation**

```js
// src/index.js
const fs = require('fs');
const path = require('path');
const { authenticate } = require('./auth.js');
const { fetchEmailsFromSender, extractHtmlBody, extractInlineImages, getAttachment } = require('./gmail.js');
const { parseEmailHtml } = require('./parser.js');
const { downloadAndEncodeImage } = require('./images.js');
const { loadLedger, saveLedger, isProcessed, markProcessed, pruneOldEntries } = require('./ledger.js');
const { writeStatus } = require('./status.js');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const CREDENTIALS_PATH = path.join(ROOT, 'credentials.json');
const TOKEN_PATH = path.join(ROOT, 'token.json');
const STATUS_PATH = path.join(ROOT, 'last-run-status.json');

async function run() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const outputDir = path.resolve(ROOT, config.outputDir);
  const ledgerPath = path.resolve(ROOT, config.processedLedger);

  fs.mkdirSync(outputDir, { recursive: true });

  let auth;
  try {
    auth = await authenticate(CREDENTIALS_PATH, TOKEN_PATH);
  } catch (err) {
    writeStatus(STATUS_PATH, { status: 'error', message: `Auth failed: ${err.message}` });
    console.error('Authentication failed:', err.message);
    process.exit(1);
  }

  let ledger = loadLedger(ledgerPath);
  ledger = pruneOldEntries(ledger, new Date());

  const stats = { found: 0, parsed: 0, failed: 0, skipped: 0 };

  for (const sender of config.senders) {
    console.log(`Fetching emails from ${sender}...`);
    let messages;
    try {
      messages = await fetchEmailsFromSender(auth, sender);
    } catch (err) {
      console.error(`Failed to fetch from ${sender}:`, err.message);
      stats.failed++;
      continue;
    }

    stats.found += messages.length;

    for (const msg of messages) {
      if (isProcessed(ledger, msg.id)) {
        stats.skipped++;
        continue;
      }

      try {
        const html = extractHtmlBody(msg.payload);
        if (!html) {
          console.log(`No HTML body for message ${msg.id}, skipping`);
          stats.skipped++;
          continue;
        }

        // Parse HTML to structured JSON
        const parsed = parseEmailHtml(html);

        // Extract metadata
        const headers = msg.payload.headers || [];
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
        const date = headers.find(h => h.name.toLowerCase() === 'date')?.value;
        const dateStr = date ? new Date(date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

        // Resolve CID images
        const cidMap = extractInlineImages(msg.payload);
        for (const cid in cidMap) {
          const attachData = await getAttachment(auth, msg.id, cidMap[cid]);
          cidMap[cid] = attachData;
        }

        // Download and encode all images
        await processImages(parsed.elements, cidMap);

        // Build output
        const output = {
          meta: {
            sender,
            subject,
            date: dateStr,
            messageId: msg.id,
          },
          ...parsed,
        };

        // Write JSON file
        const hash = msg.id.slice(0, 6);
        const safeSender = sender.replace(/[@.]/g, '-');
        const safeSubject = subject.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50).toLowerCase();
        const filename = `${dateStr}-${safeSender}-${safeSubject}-${hash}.json`;
        const outputPath = path.join(outputDir, filename);
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

        console.log(`Parsed: ${filename}`);
        ledger = markProcessed(ledger, msg.id, dateStr);
        stats.parsed++;
      } catch (err) {
        console.error(`Failed to parse message ${msg.id}:`, err.message);
        stats.failed++;
      }
    }
  }

  saveLedger(ledgerPath, ledger);
  writeStatus(STATUS_PATH, { status: 'ok', ...stats });
  console.log(`Done. Found: ${stats.found}, Parsed: ${stats.parsed}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`);
}

async function processImages(elements, cidMap) {
  for (const el of elements) {
    if (el.type === 'image' && el.src) {
      const result = await downloadAndEncodeImage(el.src, cidMap);
      if (result) {
        el.base64 = result.base64;
        el.width = result.width;
        el.height = result.height;
      } else {
        // Replace with placeholder
        el.type = 'section';
        el.direction = 'vertical';
        el.bgColor = '#f0f0f0';
        el.children = [{
          type: 'text',
          content: `[Image failed to load: ${el.src}]`,
          fontSize: 12,
          fontWeight: 'normal',
          color: '#999999',
          align: 'center',
        }];
      }
      delete el.src;
    }
    if (el.children) {
      await processImages(el.children, cidMap);
    }
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  writeStatus(STATUS_PATH, { status: 'error', message: err.message });
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/index.js
git commit -m "feat: add main pipeline orchestrator"
```

---

### Task 8: Integration test with sample email

**Files:**
- Create: `tests/integration.test.js`

- [ ] **Step 1: Write integration test**

```js
// tests/integration.test.js
import { describe, it, expect } from 'vitest';
import { parseEmailHtml } from '../src/parser.js';
import fs from 'fs';
import path from 'path';

describe('integration: full email parse', () => {
  it('parses simple-email.html into valid schema', () => {
    const html = fs.readFileSync(
      path.join(__dirname, 'fixtures', 'simple-email.html'), 'utf-8'
    );
    const result = parseEmailHtml(html);

    // Schema structure
    expect(result.schemaVersion).toBe(1);
    expect(result.width).toBe(600);
    expect(Array.isArray(result.elements)).toBe(true);

    // All elements have a type
    const all = flattenElements(result.elements);
    for (const el of all) {
      expect(el.type).toBeDefined();
      expect(['section', 'text', 'image', 'button', 'spacer', 'divider']).toContain(el.type);
    }

    // Text elements have required fields
    const texts = all.filter(e => e.type === 'text');
    for (const t of texts) {
      expect(t.content).toBeDefined();
      expect(t.fontSize).toBeTypeOf('number');
      expect(t.color).toBeDefined();
    }

    // Image elements have src or base64
    const images = all.filter(e => e.type === 'image');
    for (const img of images) {
      expect(img.src || img.base64).toBeDefined();
    }

    // Button elements have required fields
    const buttons = all.filter(e => e.type === 'button');
    for (const btn of buttons) {
      expect(btn.label).toBeDefined();
      expect(btn.bgColor).toBeDefined();
    }
  });
});

function flattenElements(elements) {
  const result = [];
  for (const el of elements) {
    result.push(el);
    if (el.children) result.push(...flattenElements(el.children));
  }
  return result;
}
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.js
git commit -m "test: add integration test for full email parsing pipeline"
```

---

## Chunk 4: Figma Plugin

### Task 9: Figma plugin scaffold

**Files:**
- Create: `email-remixer-plugin/manifest.json`
- Create: `email-remixer-plugin/package.json`
- Create: `email-remixer-plugin/tsconfig.json`

- [ ] **Step 1: Create manifest.json**

```json
{
  "name": "Email Remixer",
  "id": "email-remixer-plugin",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "src/ui.html",
  "editorType": ["figma"]
}
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "email-remixer-plugin",
  "version": "1.0.0",
  "scripts": {
    "build": "esbuild src/code.ts --bundle --outfile=dist/code.js --target=es6",
    "watch": "esbuild src/code.ts --bundle --outfile=dist/code.js --target=es6 --watch"
  },
  "devDependencies": {
    "@figma/plugin-typings": "^1.100.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES6",
    "module": "commonjs",
    "strict": true,
    "outDir": "dist",
    "typeRoots": ["node_modules/@figma"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Install plugin dependencies**

```bash
cd ~/email-remixer/email-remixer-plugin
npm install
```

- [ ] **Step 5: Create dist directory**

```bash
mkdir -p dist
```

- [ ] **Step 6: Commit**

```bash
cd ~/email-remixer
git add email-remixer-plugin/manifest.json email-remixer-plugin/package.json email-remixer-plugin/tsconfig.json
git commit -m "chore: scaffold Figma plugin project"
```

---

### Task 10: Figma plugin UI

**Files:**
- Create: `email-remixer-plugin/src/ui.html`

- [ ] **Step 1: Write plugin UI**

```html
<!-- email-remixer-plugin/src/ui.html -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: Inter, system-ui, sans-serif;
      margin: 0;
      padding: 16px;
      background: #ffffff;
      color: #333;
    }
    h2 {
      font-size: 14px;
      margin: 0 0 12px 0;
    }
    .drop-zone {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 32px 16px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }
    .drop-zone:hover, .drop-zone.dragover {
      border-color: #18a0fb;
      background: #f0f8ff;
    }
    .drop-zone p {
      margin: 0 0 8px 0;
      font-size: 13px;
      color: #666;
    }
    input[type="file"] {
      display: none;
    }
    .status {
      margin-top: 12px;
      font-size: 12px;
      color: #666;
    }
    .status.error {
      color: #e63946;
    }
    .status.success {
      color: #2d6a4f;
    }
  </style>
</head>
<body>
  <h2>Email Remixer</h2>
  <div class="drop-zone" id="dropZone">
    <p>Drop a parsed email JSON file here</p>
    <p>or click to browse</p>
  </div>
  <input type="file" id="fileInput" accept=".json">
  <div class="status" id="status"></div>

  <script>
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const status = document.getElementById('status');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFile(file);
    });

    function handleFile(file) {
      if (!file.name.endsWith('.json')) {
        setStatus('Please select a .json file', 'error');
        return;
      }

      setStatus('Reading file...');
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.meta || !data.elements) {
            setStatus('Invalid email JSON format', 'error');
            return;
          }
          setStatus(`Importing: ${data.meta.subject}...`);
          parent.postMessage({ pluginMessage: { type: 'import', data } }, '*');
        } catch (err) {
          setStatus('Failed to parse JSON: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    }

    function setStatus(msg, type) {
      status.textContent = msg;
      status.className = 'status' + (type ? ' ' + type : '');
    }

    window.onmessage = (e) => {
      const msg = e.data.pluginMessage;
      if (msg?.type === 'done') {
        setStatus(`Imported "${msg.subject}" successfully`, 'success');
      } else if (msg?.type === 'error') {
        setStatus('Import failed: ' + msg.message, 'error');
      }
    };
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
cd ~/email-remixer
git add email-remixer-plugin/src/ui.html
git commit -m "feat: add Figma plugin UI with drag-and-drop file picker"
```

---

### Task 11: Figma plugin code (node creation)

**Files:**
- Create: `email-remixer-plugin/src/code.ts`

- [ ] **Step 1: Write plugin code**

```ts
// email-remixer-plugin/src/code.ts

interface EmailData {
  meta: {
    sender: string;
    subject: string;
    date: string;
    messageId: string;
  };
  schemaVersion: number;
  width: number;
  elements: Element[];
}

type Element =
  | SectionElement
  | TextElement
  | ImageElement
  | ButtonElement
  | SpacerElement
  | DividerElement;

interface SectionElement {
  type: 'section';
  direction: 'vertical' | 'horizontal';
  padding?: number[];
  bgColor?: string;
  width?: number;
  children: Element[];
}

interface TextElement {
  type: 'text';
  content: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  align: string;
  lineHeight?: number;
  letterSpacing?: number;
  href?: string;
}

interface ImageElement {
  type: 'image';
  base64?: string;
  src?: string;
  width?: number;
  height?: number;
}

interface ButtonElement {
  type: 'button';
  label: string;
  fontSize: number;
  color: string;
  bgColor: string;
  borderRadius: number;
  href: string;
}

interface SpacerElement {
  type: 'spacer';
  height?: number;
  width?: number;
}

interface DividerElement {
  type: 'divider';
  color: string;
  thickness: number;
}

// Font loading
let fontsLoaded = false;

async function loadFonts(): Promise<void> {
  if (fontsLoaded) return;
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  } catch {
    // Fallback to Roboto
    await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Roboto', style: 'Bold' });
  }
  fontsLoaded = true;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

function getFontName(weight: string): FontName {
  const style = weight === 'bold' || weight === '700' ? 'Bold' : 'Regular';
  // Try Inter first, fall back to Roboto
  return { family: 'Inter', style };
}

function getAlignment(align: string): 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' {
  switch (align) {
    case 'center': return 'CENTER';
    case 'right': return 'RIGHT';
    case 'justify': return 'JUSTIFIED';
    default: return 'LEFT';
  }
}

async function createElementNode(el: Element, parentWidth: number): Promise<SceneNode | null> {
  switch (el.type) {
    case 'section':
      return createSection(el, parentWidth);
    case 'text':
      return createText(el, parentWidth);
    case 'image':
      return createImage(el, parentWidth);
    case 'button':
      return createButton(el);
    case 'spacer':
      return createSpacer(el);
    case 'divider':
      return createDivider(el, parentWidth);
    default:
      return null;
  }
}

async function createSection(el: SectionElement, parentWidth: number): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.layoutMode = el.direction === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'FIXED';
  frame.resize(el.width || parentWidth, 10); // height auto

  if (el.padding) {
    frame.paddingTop = el.padding[0] || 0;
    frame.paddingRight = el.padding[1] || 0;
    frame.paddingBottom = el.padding[2] || 0;
    frame.paddingLeft = el.padding[3] || 0;
  }

  if (el.bgColor) {
    frame.fills = [{ type: 'SOLID', color: hexToRgb(el.bgColor) }];
  } else {
    frame.fills = [];
  }

  for (const child of el.children) {
    const childNode = await createElementNode(child, el.width || parentWidth);
    if (childNode) {
      frame.appendChild(childNode);
    }
  }

  return frame;
}

async function createText(el: TextElement, parentWidth: number): Promise<TextNode> {
  const node = figma.createText();
  node.fontName = getFontName(el.fontWeight);
  node.characters = el.content;
  node.fontSize = el.fontSize;
  node.fills = [{ type: 'SOLID', color: hexToRgb(el.color) }];
  node.textAlignHorizontal = getAlignment(el.align);
  node.resize(parentWidth, node.height);
  node.textAutoResize = 'HEIGHT';

  if (el.lineHeight && el.lineHeight > 0) {
    if (el.lineHeight <= 5) {
      // Likely a multiplier (e.g. 1.5)
      node.lineHeight = { value: el.lineHeight * el.fontSize, unit: 'PIXELS' };
    } else {
      node.lineHeight = { value: el.lineHeight, unit: 'PIXELS' };
    }
  }

  if (el.letterSpacing) {
    node.letterSpacing = { value: el.letterSpacing, unit: 'PIXELS' };
  }

  return node;
}

async function createImage(el: ImageElement, parentWidth: number): Promise<RectangleNode> {
  const rect = figma.createRectangle();
  const w = el.width || parentWidth;
  const h = el.height || Math.round(w * 0.5);
  rect.resize(w, h);

  if (el.base64) {
    try {
      // Strip data URI prefix
      const base64Data = el.base64.replace(/^data:[^;]+;base64,/, '');
      const bytes = figma.base64Decode(base64Data);
      const image = figma.createImage(bytes);
      rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
    } catch (err) {
      // Placeholder fill on error
      rect.fills = [{ type: 'SOLID', color: { r: 0.94, g: 0.94, b: 0.94 } }];
    }
  } else {
    rect.fills = [{ type: 'SOLID', color: { r: 0.94, g: 0.94, b: 0.94 } }];
  }

  return rect;
}

async function createButton(el: ButtonElement): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.primaryAxisAlignItems = 'CENTER';
  frame.counterAxisAlignItems = 'CENTER';
  frame.paddingTop = 12;
  frame.paddingBottom = 12;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.cornerRadius = el.borderRadius;
  frame.fills = [{ type: 'SOLID', color: hexToRgb(el.bgColor) }];

  const text = figma.createText();
  text.fontName = getFontName('bold');
  text.characters = el.label;
  text.fontSize = el.fontSize;
  text.fills = [{ type: 'SOLID', color: hexToRgb(el.color) }];
  text.textAutoResize = 'WIDTH_AND_HEIGHT';

  frame.appendChild(text);
  return frame;
}

function createSpacer(el: SpacerElement): FrameNode {
  const frame = figma.createFrame();
  frame.resize(el.width || 1, el.height || 20);
  frame.fills = [];
  return frame;
}

function createDivider(el: DividerElement, parentWidth: number): RectangleNode {
  const rect = figma.createRectangle();
  rect.resize(parentWidth, el.thickness || 1);
  rect.fills = [{ type: 'SOLID', color: hexToRgb(el.color || '#cccccc') }];
  return rect;
}

// Main plugin handler
figma.showUI(__html__, { width: 320, height: 240 });

figma.ui.onmessage = async (msg: { type: string; data?: EmailData }) => {
  if (msg.type !== 'import' || !msg.data) return;

  try {
    await loadFonts();

    const data = msg.data;
    const { sender, subject, date } = data.meta;

    // Create top-level frame
    const root = figma.createFrame();
    root.name = `${sender} - ${subject} - ${date}`;
    root.layoutMode = 'VERTICAL';
    root.primaryAxisSizingMode = 'AUTO';
    root.counterAxisSizingMode = 'FIXED';
    root.resize(data.width || 600, 10);
    root.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

    // Create all elements
    for (const el of data.elements) {
      const node = await createElementNode(el, data.width || 600);
      if (node) {
        root.appendChild(node);
      }
    }

    // Position offset from existing content
    const nodes = figma.currentPage.children;
    let maxX = 0;
    for (const n of nodes) {
      if (n === root) continue;
      const right = n.x + n.width;
      if (right > maxX) maxX = right;
    }
    root.x = maxX + 100;
    root.y = 0;

    // Select and scroll to it
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);

    figma.ui.postMessage({ type: 'done', subject });
  } catch (err: any) {
    figma.ui.postMessage({ type: 'error', message: err.message || 'Unknown error' });
  }
};
```

- [ ] **Step 2: Build the plugin**

```bash
cd ~/email-remixer/email-remixer-plugin
npx esbuild src/code.ts --bundle --outfile=dist/code.js --target=es6
```

Expected: Bundle succeeds, `dist/code.js` created.

- [ ] **Step 3: Commit**

```bash
cd ~/email-remixer
git add email-remixer-plugin/src/code.ts email-remixer-plugin/dist/code.js
git commit -m "feat: add Figma plugin code for creating editable layers from email JSON"
```

---

## Chunk 5: First Run + Cron Setup

### Task 12: First run -- authenticate Gmail

- [ ] **Step 1: Run the parser for the first time**

```bash
cd ~/email-remixer
node src/index.js
```

This will:
1. Open a browser window for Gmail consent
2. You approve access
3. A `token.json` is saved
4. Emails from `support@hears.com` are fetched, parsed, and saved to `output/`

- [ ] **Step 2: Verify output files were created**

```bash
ls -la ~/email-remixer/output/
cat ~/email-remixer/last-run-status.json
```

Expected: JSON files in output/, status shows `"status": "ok"`.

- [ ] **Step 3: Commit non-sensitive files**

```bash
git add last-run-status.json
git commit -m "chore: verify first run succeeded"
```

---

### Task 13: Load the Figma plugin and test import

- [ ] **Step 1: Open Figma Desktop**

Open the AI Almanac file: `https://www.figma.com/design/GpSo07x9no0qnRKpaUNHDG/AI-ALMANAC`

- [ ] **Step 2: Navigate to page 3**

Click on page 3 in the left sidebar.

- [ ] **Step 3: Import the plugin**

Go to: **Plugins > Development > Import plugin from manifest...**

Navigate to: `~/email-remixer/email-remixer-plugin/manifest.json`

- [ ] **Step 4: Run the plugin**

Go to: **Plugins > Development > Email Remixer**

The plugin UI should open with a file picker.

- [ ] **Step 5: Import a parsed email**

1. Click the drop zone or drag a JSON file from `~/email-remixer/output/`
2. The plugin should create editable frames on the canvas
3. Verify: text is editable, images are visible, sections are grouped

---

### Task 14: Set up daily cron

- [ ] **Step 1: Find Node.js path**

```bash
which node
```

- [ ] **Step 2: Create cron wrapper script**

Create `~/email-remixer/run.sh`:
```bash
#!/bin/bash
export PATH="/usr/local/bin:$PATH"
cd /Users/valentinandreev/email-remixer
node src/index.js >> logs/cron.log 2>&1
```

```bash
chmod +x ~/email-remixer/run.sh
```

- [ ] **Step 3: Add cron entry**

```bash
crontab -e
```

Add line:
```
0 9 * * * /Users/valentinandreev/email-remixer/run.sh
```

- [ ] **Step 4: Verify cron is set**

```bash
crontab -l
```

Expected: Shows the 9am entry.

- [ ] **Step 5: Commit**

```bash
cd ~/email-remixer
git add run.sh
git commit -m "chore: add daily cron wrapper script"
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Setup | Initialize project, deps, config |
| 2 | Auth | Gmail OAuth2 module |
| 3 | Gmail | Email fetching + HTML extraction |
| 4 | Parser | HTML-to-JSON conversion |
| 5 | Images | Download, resize, base64 encode |
| 6 | Ledger | Track processed emails + status |
| 7 | Pipeline | Main orchestrator (index.js) |
| 8 | Tests | Integration test |
| 9 | Plugin | Figma plugin scaffold |
| 10 | Plugin | Plugin UI (file picker) |
| 11 | Plugin | Plugin code (node creation) |
| 12 | Run | First Gmail auth + verify |
| 13 | Run | Load plugin in Figma + test |
| 14 | Cron | Set up daily schedule |
