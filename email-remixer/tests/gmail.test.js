import { describe, it, expect } from 'vitest';
import { extractHtmlBody } from '../src/gmail.js';

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
