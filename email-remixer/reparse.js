// Quick offline re-parser: reads raw-html/ files, parses with updated parser, merges image data from existing output/
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseEmailHtml } from './src/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, 'raw-html');
const OUTPUT_DIR = path.join(__dirname, 'output');

const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.html'));
console.log(`Found ${rawFiles.length} raw HTML files to re-parse`);

let updated = 0;
for (const file of rawFiles) {
  const basename = file.replace('.html', '');
  const htmlPath = path.join(RAW_DIR, file);
  const jsonPath = path.join(OUTPUT_DIR, `${basename}.json`);

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const parsed = parseEmailHtml(html);

  // Try to merge image base64 data from existing JSON output
  let existingData = null;
  if (fs.existsSync(jsonPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch {}
  }

  // Build a map of existing image base64 by altText or position
  const existingImages = new Map();
  if (existingData) {
    (function collectImages(elements, idx = 0) {
      for (const el of elements) {
        if (el.type === 'image' && el.base64) {
          existingImages.set(el.altText || `img-${idx}`, { base64: el.base64, width: el.width, height: el.height });
          idx++;
        }
        if (el.children) collectImages(el.children, idx);
      }
    })(existingData.elements || []);
  }

  // Apply existing base64 data to new parsed images
  let imgIdx = 0;
  (function applyImages(elements) {
    for (const el of elements) {
      if (el.type === 'image' && el.src) {
        const match = existingImages.get(el.altText || `img-${imgIdx}`);
        if (match) {
          el.base64 = match.base64;
          if (match.width) el.width = el.width || match.width;
          if (match.height) el.height = el.height || match.height;
          delete el.src;
        }
        imgIdx++;
      }
      if (el.children) applyImages(el.children);
    }
  })(parsed.elements);

  // Keep existing meta
  const output = {
    meta: existingData?.meta || { sender: 'unknown', subject: basename, date: '' },
    ...parsed,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  updated++;
  console.log(`Re-parsed: ${basename}`);
}

console.log(`Done. Updated ${updated}/${rawFiles.length} files.`);
