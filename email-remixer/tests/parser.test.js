import { describe, it, expect } from 'vitest';
import { parseEmailHtml } from '../src/parser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readFixture = (name) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');

function flattenElements(elements) {
  const result = [];
  for (const el of elements) {
    result.push(el);
    if (el.children) result.push(...flattenElements(el.children));
  }
  return result;
}

describe('parser', () => {
  describe('parseEmailHtml', () => {
    it('parses a simple email into structured elements', () => {
      const html = readFixture('simple-email.html');
      const result = parseEmailHtml(html);

      expect(result.schemaVersion).toBe(1);
      expect(result.width).toBe(600);
      expect(result.elements.length).toBeGreaterThan(0);

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
      expect(buttons[0].backgroundColor).toBe('#e63946');
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
