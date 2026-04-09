import fetch from 'node-fetch';
import sharp from 'sharp';

export const IMAGE_MAX_WIDTH = 1200;
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024; // 4MB Figma limit

export function resolveImageSrc(src, cidMap) {
  if (!src) return null;
  if (src.startsWith('cid:')) {
    const cid = src.replace('cid:', '');
    const data = cidMap[cid];
    if (data) return { type: 'inline', data };
    return null;
  }
  if (src.startsWith('data:')) return { type: 'data', data: src };
  if (src.startsWith('http://') || src.startsWith('https://')) return { type: 'url', url: src };
  return null;
}

export function isOversized(buffer) {
  return buffer.length > IMAGE_MAX_BYTES;
}

export async function downloadAndEncodeImage(src, cidMap) {
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
    const metadata = await sharp(buffer).metadata();
    if (metadata.width > IMAGE_MAX_WIDTH) {
      buffer = await sharp(buffer).resize({ width: IMAGE_MAX_WIDTH }).toBuffer();
    }
    if (isOversized(buffer)) return null;
    const base64 = buffer.toString('base64');
    const fmt = metadata.format;
    const mime = fmt === 'png' ? 'image/png' : fmt === 'gif' ? 'image/gif' : fmt === 'webp' ? 'image/webp' : 'image/jpeg';
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
