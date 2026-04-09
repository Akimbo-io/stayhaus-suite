import { describe, it, expect } from 'vitest';
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

    it('returns data type for data: URIs', () => {
      const result = resolveImageSrc('data:image/gif;base64,R0lGOD...', {});
      expect(result.type).toBe('data');
    });

    it('returns null for empty src', () => {
      const result = resolveImageSrc('', {});
      expect(result).toBeNull();
    });

    it('returns null for null src', () => {
      const result = resolveImageSrc(null, {});
      expect(result).toBeNull();
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
