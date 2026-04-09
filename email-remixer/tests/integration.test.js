import { describe, it, expect } from 'vitest';
import { parseEmailHtml } from '../src/parser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function flattenElements(elements) {
  const result = [];
  for (const el of elements) {
    result.push(el);
    if (el.children) result.push(...flattenElements(el.children));
  }
  return result;
}

describe('integration: full email parse', () => {
  it('parses simple-email.html into valid schema', () => {
    const html = fs.readFileSync(
      path.join(__dirname, 'fixtures', 'simple-email.html'), 'utf-8'
    );
    const result = parseEmailHtml(html);

    expect(result.schemaVersion).toBe(1);
    expect(result.width).toBe(600);
    expect(Array.isArray(result.elements)).toBe(true);

    const all = flattenElements(result.elements);
    for (const el of all) {
      expect(el.type).toBeDefined();
      expect(['section', 'text', 'image', 'button', 'spacer', 'divider']).toContain(el.type);
    }

    const texts = all.filter(e => e.type === 'text');
    for (const t of texts) {
      expect(t.content).toBeDefined();
      expect(t.fontSize).toBeTypeOf('number');
      expect(t.color).toBeDefined();
    }

    const images = all.filter(e => e.type === 'image');
    for (const img of images) {
      expect(img.src || img.base64).toBeDefined();
    }

    const buttons = all.filter(e => e.type === 'button');
    for (const btn of buttons) {
      expect(btn.label).toBeDefined();
      expect(btn.bgColor).toBeDefined();
    }
  });
});
