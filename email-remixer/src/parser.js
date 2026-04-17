import * as cheerio from 'cheerio';
import juice from 'juice';

// ── CSS helpers ──────────────────────────────────────────────────────────────

function parsePx(val) {
  if (!val) return null;
  const match = String(val).trim().match(/^([\d.]+)\s*(px)?$/i);
  return match ? parseFloat(match[1]) : null;
}

function parseColor(val) {
  if (!val) return null;
  const v = val.trim();
  if (!v || v === 'transparent' || v === 'none' || v === 'inherit' || v === 'initial' || v === 'unset') return null;
  if (v.startsWith('#') || v.startsWith('rgb')) return v;
  // Background shorthand — extract color component
  const hexMatch = v.match(/(#[0-9a-fA-F]{3,8})/);
  if (hexMatch) return hexMatch[1];
  const rgbMatch = v.match(/(rgba?\([^)]+\))/);
  if (rgbMatch) return rgbMatch[1];
  // Named colors common in emails
  const named = new Set([
    'white', 'black', 'red', 'blue', 'green', 'yellow', 'orange', 'purple',
    'pink', 'grey', 'gray', 'navy', 'teal', 'aqua', 'maroon', 'olive',
    'silver', 'lime', 'fuchsia', 'cyan', 'magenta', 'ivory', 'beige',
    'coral', 'crimson', 'darkblue', 'darkgreen', 'darkgray', 'darkgrey',
    'darkred', 'gold', 'indigo', 'khaki', 'lavender', 'lightblue',
    'lightgray', 'lightgrey', 'lightgreen', 'linen', 'midnightblue',
    'mintcream', 'mistyrose', 'moccasin', 'oldlace', 'orangered',
    'orchid', 'peru', 'plum', 'powderblue', 'rosybrown', 'royalblue',
    'salmon', 'sienna', 'skyblue', 'slategray', 'slategrey', 'snow',
    'steelblue', 'tan', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat',
  ]);
  if (named.has(v.toLowerCase())) return v;
  if (v.includes('url(') || v.includes('gradient')) return null;
  return null;
}

// Get background color from element (checks inline style + bgcolor attribute)
function getBgColor($el) {
  return (
    parseColor($el.css('background-color')) ||
    parseColor($el.css('background')) ||
    parseColor($el.attr('bgcolor')) ||
    null
  );
}

// Walk ancestor chain for effective background color
function getEffectiveBgColor($, node) {
  let $el = $(node);
  let depth = 0;
  while ($el.length && $el[0] && $el[0].type === 'tag' && depth < 15) {
    const bg = getBgColor($el);
    if (bg) return bg;
    $el = $el.parent();
    depth++;
  }
  return null;
}

// Get inherited CSS property (walks up ancestor chain, like browser inheritance)
function getInheritedCss($, node, prop) {
  let $el = $(node);
  let depth = 0;
  while ($el.length && $el[0] && $el[0].type === 'tag' && depth < 15) {
    const val = $el.css(prop);
    if (val) {
      // Skip font-size: 0 (whitespace collapse hack in some email builders)
      if (prop === 'font-size' && parsePx(val) === 0) {
        $el = $el.parent();
        depth++;
        continue;
      }
      return val;
    }
    // Check HTML attributes for certain properties
    if (prop === 'text-align') {
      const align = $el.attr('align');
      if (align) return align;
    }
    $el = $el.parent();
    depth++;
  }
  return null;
}

// Get numeric width from element
function getWidth($el) {
  const wAttr = $el.attr('width');
  if (wAttr) {
    const n = parsePx(wAttr);
    if (n) return n;
  }
  return parsePx($el.css('width')) || parsePx($el.css('max-width')) || null;
}

function getPadding($el) {
  const raw = $el.css('padding');
  if (raw) {
    const parsed = parsePaddingShorthand(raw);
    if (parsed) {
      const { top, right, bottom, left } = parsed;
      if (top === right && right === bottom && bottom === left) return top || null;
      if (top || right || bottom || left) return { top, right, bottom, left };
    }
  }
  const top = parsePx($el.css('padding-top')) ?? 0;
  const right = parsePx($el.css('padding-right')) ?? 0;
  const bottom = parsePx($el.css('padding-bottom')) ?? 0;
  const left = parsePx($el.css('padding-left')) ?? 0;
  if (top || right || bottom || left) {
    if (top === right && right === bottom && bottom === left) return top;
    return { top, right, bottom, left };
  }
  return null;
}

function parsePaddingShorthand(val) {
  if (!val) return null;
  const parts = val.trim().split(/\s+/).map(p => parsePx(p) ?? 0);
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  if (parts.length >= 4) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  return null;
}

// Extract font-family with CSS inheritance
function getFontFamily($, node) {
  const ff = getInheritedCss($, node, 'font-family');
  if (!ff) return null;
  const primary = ff.split(',')[0].trim().replace(/['"]/g, '');
  return primary || null;
}

const HEADING_SIZES = { h1: 36, h2: 28, h3: 22, h4: 18, h5: 16, h6: 14 };

function isButtonStyle($el) {
  const bg = parseColor($el.css('background-color')) || parseColor($el.css('background'));
  if (!bg) return false;
  const hasPadding = $el.css('padding') || $el.css('padding-top') || $el.css('padding-left');
  const hasBorderRadius = $el.css('border-radius');
  const display = $el.css('display');
  const isInlineBlock = display === 'inline-block' || display === 'block';
  // Border-based buttons (thick borders acting as padding)
  const borderTop = $el.css('border-top');
  const hasBorderPadding = borderTop && parsePx(borderTop) > 4;
  return !!(hasPadding || hasBorderRadius || isInlineBlock || hasBorderPadding);
}

// Tags that are transparent containers — recurse into children
const CONTAINER_TAGS = new Set([
  'center', 'section', 'article', 'main', 'header', 'footer', 'nav',
  'aside', 'figure', 'figcaption', 'blockquote', 'ul', 'ol',
]);

// ── Element extraction ───────────────────────────────────────────────────────

function extractElementsFromNode($, node) {
  const elements = [];
  if (!node || node.type !== 'tag') return elements;
  const tag = node.name.toLowerCase();
  const $el = $(node);

  // ── table → recurse as section ──
  if (tag === 'table') {
    const section = processTable($, node);
    if (section) elements.push(section);
    return elements;
  }

  // ── img ──
  if (tag === 'img') {
    const src = $el.attr('src');
    if (src && !src.startsWith('data:image/gif') && src.length > 10) {
      const el = { type: 'image', src };
      const w = getWidth($el);
      if (w) el.width = w;
      const hAttr = $el.attr('height');
      if (hAttr) el.height = parsePx(hAttr) ?? undefined;
      const alt = $el.attr('alt');
      if (alt) el.altText = alt;
      const br = parsePx($el.css('border-radius'));
      if (br) el.cornerRadius = br;
      elements.push(el);
    }
    return elements;
  }

  // ── anchor / button ──
  if (tag === 'a') {
    const href = $el.attr('href') || '';
    const label = $el.text().trim();

    // Anchor wraps image with no text → extract image
    const imgChild = $el.find('img').first();
    if (!label && imgChild.length) {
      return extractElementsFromNode($, imgChild[0]);
    }

    if (label && isButtonStyle($el)) {
      const el = { type: 'button', label, href };
      const bg = parseColor($el.css('background-color')) || parseColor($el.css('background'));
      if (bg) el.backgroundColor = bg;
      const color = $el.css('color');
      if (color) el.textColor = color;
      const fs = parsePx($el.css('font-size'));
      if (fs) el.fontSize = fs;
      const fw = $el.css('font-weight');
      if (fw) el.fontWeight = fw;
      const br = parsePx($el.css('border-radius'));
      if (br) el.cornerRadius = br;
      const ff = getFontFamily($, node);
      if (ff) el.fontFamily = ff;
      // Extract paddingH / paddingV
      const rawPad = $el.css('padding');
      if (rawPad) {
        const parsed = parsePaddingShorthand(rawPad);
        if (parsed) {
          el.paddingH = Math.max(parsed.left, parsed.right);
          el.paddingV = Math.max(parsed.top, parsed.bottom);
        }
      } else {
        const pt = parsePx($el.css('padding-top')) ?? 0;
        const pr = parsePx($el.css('padding-right')) ?? 0;
        const pb = parsePx($el.css('padding-bottom')) ?? 0;
        const pl = parsePx($el.css('padding-left')) ?? 0;
        if (pt || pr || pb || pl) {
          el.paddingV = Math.max(pt, pb);
          el.paddingH = Math.max(pr, pl);
        }
      }
      // Border-based buttons — thick borders act as padding
      if (!el.paddingV) {
        const bt = parsePx($el.css('border-top'));
        if (bt && bt > 4) el.paddingV = bt;
      }
      if (!el.paddingH) {
        const bl = parsePx($el.css('border-left'));
        if (bl && bl > 4) el.paddingH = bl;
      }
      elements.push(el);
      return elements;
    }

    // Check for styled child (e.g. <a><span style="background-color:...">Button</span></a>)
    if (label) {
      const styledChild = $el.children('span, div').filter((_, c) => isButtonStyle($(c))).first();
      if (styledChild.length) {
        const $btn = styledChild;
        const el = { type: 'button', label, href };
        const bg = parseColor($btn.css('background-color')) || parseColor($btn.css('background'));
        if (bg) el.backgroundColor = bg;
        const color = $btn.css('color') || $el.css('color');
        if (color) el.textColor = color;
        const fs = parsePx($btn.css('font-size')) || parsePx($el.css('font-size'));
        if (fs) el.fontSize = fs;
        const fw = $btn.css('font-weight') || $el.css('font-weight');
        if (fw) el.fontWeight = fw;
        const br = parsePx($btn.css('border-radius'));
        if (br) el.cornerRadius = br;
        const ff = getFontFamily($, node);
        if (ff) el.fontFamily = ff;
        const rawPad = $btn.css('padding');
        if (rawPad) {
          const parsed = parsePaddingShorthand(rawPad);
          if (parsed) {
            el.paddingH = Math.max(parsed.left, parsed.right);
            el.paddingV = Math.max(parsed.top, parsed.bottom);
          }
        } else {
          const pt = parsePx($btn.css('padding-top')) ?? 0;
          const pr = parsePx($btn.css('padding-right')) ?? 0;
          const pb = parsePx($btn.css('padding-bottom')) ?? 0;
          const pl = parsePx($btn.css('padding-left')) ?? 0;
          if (pt || pr || pb || pl) {
            el.paddingV = Math.max(pt, pb);
            el.paddingH = Math.max(pr, pl);
          }
        }
        elements.push(el);
        return elements;
      }
    }

    // Inline link text
    if (label) {
      const el = { type: 'text', content: label };
      const color = $el.css('color');
      if (color) el.color = color;
      const fs = parsePx($el.css('font-size'));
      if (fs) el.fontSize = fs;
      const ff = getFontFamily($, node);
      if (ff) el.fontFamily = ff;
      elements.push(el);
    }
    return elements;
  }

  // ── headings ──
  if (HEADING_SIZES[tag]) {
    const content = $el.text().trim();
    if (content) {
      const el = {
        type: 'text',
        content,
        fontSize: parsePx($el.css('font-size')) ?? HEADING_SIZES[tag],
        fontWeight: $el.css('font-weight') || '700',
      };
      const color = $el.css('color') || getInheritedCss($, node, 'color');
      if (color) el.color = color;
      const align = $el.css('text-align') || $el.attr('align');
      if (align) el.align = align;
      const ff = getFontFamily($, node);
      if (ff) el.fontFamily = ff;
      const lh = parseFloat($el.css('line-height') || '');
      if (!isNaN(lh)) el.lineHeight = lh;
      elements.push(el);
    }
    return elements;
  }

  // ── hr → divider ──
  if (tag === 'hr') {
    const el = { type: 'divider' };
    const borderColor = $el.css('border-color') || $el.css('color') || $el.css('border-top-color');
    if (borderColor) el.color = parseColor(borderColor);
    const bw = parsePx($el.css('border-width')) || parsePx($el.css('border-top-width'));
    if (bw) el.thickness = bw;
    elements.push(el);
    return elements;
  }

  // ── container tags → recurse, but preserve background if set ──
  if (CONTAINER_TAGS.has(tag)) {
    const bg = getBgColor($el);
    const pad = getPadding($el);
    const childElements = [];
    for (const child of node.children ?? []) {
      if (child.type === 'tag') childElements.push(...extractElementsFromNode($, child));
    }
    if ((bg || pad) && childElements.length > 0) {
      const section = { type: 'section', direction: 'vertical', children: childElements };
      if (bg) section.backgroundColor = bg;
      if (pad) section.padding = pad;
      elements.push(section);
    } else {
      elements.push(...childElements);
    }
    return elements;
  }

  // ── p / span / div / td / th / li ──
  if (['p', 'span', 'div', 'td', 'th', 'li'].includes(tag)) {
    const children = $el.children().toArray();
    const childTags = children.map(c => c.name?.toLowerCase()).filter(Boolean);

    // Single <a> child → check for table-wrapped button first, then delegate
    if (childTags.length === 1 && childTags[0] === 'a') {
      const $a = $(children[0]);
      const aLabel = $a.text().trim();
      const tdBg = getBgColor($el);
      // Table-wrapped button: td/div has background color, contains single <a> with text
      if (aLabel && tdBg && !isButtonStyle($a)) {
        const el = { type: 'button', label: aLabel, href: $a.attr('href') || '' };
        el.backgroundColor = tdBg;
        const textColor = $a.css('color');
        if (textColor) el.textColor = textColor;
        const fs = parsePx($a.css('font-size')) || parsePx($el.css('font-size'));
        if (fs) el.fontSize = fs;
        const fw = $a.css('font-weight') || $el.css('font-weight');
        if (fw) el.fontWeight = fw;
        const br = parsePx($el.css('border-radius'));
        if (br) el.cornerRadius = br;
        const ff = getFontFamily($, node);
        if (ff) el.fontFamily = ff;
        // Use td/div padding as button padding
        const pad = getPadding($el);
        if (pad) {
          if (typeof pad === 'number') {
            el.paddingH = pad;
            el.paddingV = pad;
          } else {
            el.paddingH = Math.max(pad.left, pad.right);
            el.paddingV = Math.max(pad.top, pad.bottom);
          }
        }
        elements.push(el);
        return elements;
      }
      return extractElementsFromNode($, children[0]);
    }

    // Has nested tables → process ALL of them
    if (childTags.includes('table')) {
      // Check if this element has a background that should wrap the tables
      const bg = getBgColor($el);
      const pad = getPadding($el);
      const childEls = [];
      for (const child of children) {
        if (child.type === 'tag') {
          childEls.push(...extractElementsFromNode($, child));
        }
      }
      if ((bg || pad) && childEls.length > 0) {
        const section = { type: 'section', direction: 'vertical', children: childEls };
        if (bg) section.backgroundColor = bg;
        if (pad) section.padding = pad;
        elements.push(section);
      } else {
        elements.push(...childEls);
      }
      return elements;
    }

    // Has img → extract img and siblings
    if (childTags.includes('img')) {
      for (const child of children) {
        elements.push(...extractElementsFromNode($, child));
      }
      return elements;
    }

    // Has multiple block children → recurse
    const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'center', 'section', 'article'];
    if (children.some(c => blockTags.includes(c.name?.toLowerCase()))) {
      for (const child of children) {
        if (child.type === 'tag') elements.push(...extractElementsFromNode($, child));
      }
      return elements;
    }

    // Has <a> children among other content → recurse all children
    if (childTags.includes('a')) {
      for (const child of children) {
        if (child.type === 'tag') {
          elements.push(...extractElementsFromNode($, child));
        } else if (child.type === 'text') {
          const text = child.data?.trim();
          if (text) {
            const el = { type: 'text', content: text };
            const color = getInheritedCss($, node, 'color');
            if (color) el.color = color;
            const fs = parsePx(getInheritedCss($, node, 'font-size'));
            if (fs) el.fontSize = fs;
            const ff = getFontFamily($, node);
            if (ff) el.fontFamily = ff;
            elements.push(el);
          }
        }
      }
      return elements;
    }

    // Plain text content
    const text = $el.text().trim().replace(/\s+/g, ' ');
    if (text) {
      const el = { type: 'text', content: text };
      const fs = parsePx($el.css('font-size')) || parsePx(getInheritedCss($, node, 'font-size'));
      if (fs) el.fontSize = fs;
      const fw = $el.css('font-weight') || getInheritedCss($, node, 'font-weight');
      if (fw) el.fontWeight = fw;
      const color = $el.css('color') || getInheritedCss($, node, 'color');
      if (color) el.color = color;
      const align = $el.css('text-align') || $el.attr('align') || getInheritedCss($, node, 'text-align');
      if (align) el.align = align;
      const lh = parseFloat($el.css('line-height') || '');
      if (!isNaN(lh)) el.lineHeight = lh;
      const ls = parsePx($el.css('letter-spacing'));
      if (ls) el.letterSpacing = ls;
      const ff = getFontFamily($, node);
      if (ff) el.fontFamily = ff;
      elements.push(el);
    }
    return elements;
  }

  // ── fallback: recurse ──
  for (const child of node.children ?? []) {
    if (child.type === 'tag') elements.push(...extractElementsFromNode($, child));
  }
  return elements;
}

// ── Table processor ──────────────────────────────────────────────────────────

function processTable($, tableEl) {
  const $table = $(tableEl);
  const width = getWidth($table);
  const bgColor = getBgColor($table);
  const padding = getPadding($table);
  const cellspacing = parsePx($table.attr('cellspacing'));

  const rows = $table.find('> tr, > tbody > tr, > thead > tr').toArray();
  const children = [];

  for (const row of rows) {
    const $row = $(row);
    const rowBg = getBgColor($row);
    const cells = $row.children('td, th').toArray();

    if (cells.length === 0) continue;

    if (cells.length > 1) {
      // Multi-cell row → horizontal section
      const cellElements = [];
      for (const cell of cells) {
        const $cell = $(cell);
        const cellWidth = getWidth($cell);
        const cellBg = getBgColor($cell);
        const cellPad = getPadding($cell);
        const items = extractElementsFromNode($, cell);

        if (items.length === 0) continue;

        const cellSection = {
          type: 'section',
          direction: 'vertical',
          children: items,
        };
        if (cellWidth) cellSection.width = cellWidth;
        if (cellBg) cellSection.backgroundColor = cellBg;
        if (cellPad) cellSection.padding = cellPad;
        cellElements.push(cellSection);
      }

      if (cellElements.length > 0) {
        const rowSection = { type: 'section', direction: 'horizontal', children: cellElements };
        if (rowBg) rowSection.backgroundColor = rowBg;
        if (cellspacing) rowSection.gap = cellspacing;
        children.push(rowSection);
      }

    } else {
      // Single-cell row
      const cell = cells[0];
      const $cell = $(cell);
      const cellBg = getBgColor($cell) || rowBg;
      const cellPad = getPadding($cell);
      const items = extractElementsFromNode($, cell);

      if (items.length === 0) continue;

      if (cellBg || cellPad) {
        const section = { type: 'section', direction: 'vertical', children: items };
        if (cellBg) section.backgroundColor = cellBg;
        if (cellPad) section.padding = cellPad;
        children.push(section);
      } else {
        children.push(...items);
      }
    }
  }

  if (children.length === 0) return null;

  const section = { type: 'section', direction: 'vertical', children };
  if (width) section.width = width;
  if (bgColor) section.backgroundColor = bgColor;
  if (padding) section.padding = padding;
  return section;
}

// ── Flatten unnecessary wrapper sections ─────────────────────────────────────

function isWrapperSection(el) {
  return (
    el.type === 'section' &&
    !el.backgroundColor &&
    !el.padding &&
    !el.width &&
    el.direction !== 'horizontal' &&
    el.children?.length > 0
  );
}

function flattenElements(elements) {
  const result = [];
  for (const el of elements) {
    if (el.type === 'section') {
      el.children = flattenElements(el.children ?? []);
      if (isWrapperSection(el)) {
        result.push(...el.children);
      } else {
        result.push(el);
      }
    } else {
      result.push(el);
    }
  }
  return result;
}

// ── Multi-table email detection ─────────────────────────────────────────────

function findAllContentTables($) {
  const contentTables = [];
  $('table').each((_, el) => {
    const w = getWidth($(el));
    if (w && w >= 500 && w <= 800) {
      const rows = $(el).find('> tr, > tbody > tr').toArray();
      const hasContentRows = rows.some(r => {
        const cells = $(r).children('td, th').toArray();
        if (cells.length !== 1) return false;
        const $cell = $(cells[0]);
        const innerTables = $cell.children('table');
        return innerTables.length === 0;
      });
      if (hasContentRows) {
        contentTables.push(el);
      }
    }
  });
  return contentTables;
}

// ── Find the main email table ────────────────────────────────────────────────

function findMainTable($) {
  // Strategy 0: MJML/Klaviyo — div with max-width ~600 containing a table
  let mjmlTable = null;
  $('div').each((_, el) => {
    const mw = parsePx($(el).css('max-width'));
    if (mw && mw >= 500 && mw <= 800) {
      const t = $(el).children('table').first();
      if (t.length) { mjmlTable = t[0]; return false; }
    }
  });
  if (mjmlTable) return mjmlTable;

  // Strategy 1: explicit width=600/640
  for (const w of ['600', '640', '580', '700']) {
    const t = $(`table[width="${w}"]`).first();
    if (t.length) return t[0];
  }

  // Strategy 2: width in style
  let best = null;
  $('table').each((_, el) => {
    const w = parsePx($(el).css('width')) || parsePx($(el).css('max-width'));
    if (w && w >= 500 && w <= 800) { best = el; return false; }
  });
  if (best) return best;

  // Strategy 3: align=center
  const byAlign = $('table[align="center"]').first();
  if (byAlign.length) return byAlign[0];

  // Strategy 4: largest table
  let maxRows = 0;
  let largest = null;
  $('body table').each((_, el) => {
    const rows = $(el).find('tr').length;
    if (rows > maxRows) { maxRows = rows; largest = el; }
  });
  if (largest) return largest;

  // Strategy 5: first table
  const first = $('table').first();
  return first.length ? first[0] : null;
}

// ── Section categorization ───────────────────────────────────────────────────

const FOOTER_KEYWORDS = ['unsubscribe', 'opt out', 'opt-out', 'preferences', 'privacy policy', 'manage subscription', 'email preferences', 'view in browser', 'view online', '© ', 'copyright', 'all rights reserved'];
const SOCIAL_KEYWORDS = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'discord', 'follow us', 'connect with us'];
const SOCIAL_IMAGE_PATTERNS = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'discord', 'social', 'x.com', 'x-logo'];
const DISCOUNT_KEYWORDS = ['% off', 'discount', 'sale', 'save ', 'coupon', 'promo code', 'deal', 'offer', 'clearance', 'flash sale', 'limited time', 'exclusive offer', 'special offer', 'use code', 'free shipping'];
const TESTIMONIAL_KEYWORDS = ['testimonial', 'review', 'customer said', 'what our', 'hear from', '"', '\u201c', '\u201d', 'stars', '\u2605', '\u2606', 'rating', 'verified buyer', 'verified purchase', 'customer review'];
const BENEFIT_KEYWORDS = ['benefit', 'feature', 'why choose', 'why us', 'what you get', 'included', 'advantage', '\u2713', '\u2714', '\u2022', 'free ', 'easy ', 'fast ', 'secure ', 'guaranteed', 'no risk', 'money back'];
const COMPARISON_KEYWORDS = ['compare', 'comparison', 'vs', 'versus', 'difference', 'plan', 'tier', 'basic', 'premium', 'pro ', 'standard', 'enterprise', 'starter', 'pricing', 'per month', '/mo', '/year'];
const PRODUCT_KEYWORDS = ['shop now', 'buy now', 'add to cart', 'add to bag', 'view product', 'product', 'collection', 'new arrival', 'best seller', 'trending', 'price', '$', '€', '£'];
const LOGO_IMAGE_PATTERNS = ['logo', 'brand', 'company'];

function collectAllText(el) {
  const texts = [];
  if (el.type === 'text' && el.content) texts.push(el.content.toLowerCase());
  if (el.type === 'button' && el.label) texts.push(el.label.toLowerCase());
  if (el.children) for (const c of el.children) texts.push(...collectAllText(c));
  return texts;
}

function collectTypes(el) {
  const types = [];
  types.push(el.type);
  if (el.children) for (const c of el.children) types.push(...collectTypes(c));
  return types;
}

function collectImageAlts(el) {
  const alts = [];
  if (el.type === 'image' && el.altText) alts.push(el.altText.toLowerCase());
  if (el.children) for (const c of el.children) alts.push(...collectImageAlts(c));
  return alts;
}

function countElements(el, type) {
  let count = el.type === type ? 1 : 0;
  if (el.children) for (const c of el.children) count += countElements(c, type);
  return count;
}

function hasLargeImage(el) {
  if (el.type === 'image' && (el.width ?? 0) >= 400) return true;
  if (el.children) return el.children.some(c => hasLargeImage(c));
  return false;
}

function hasSmallImage(el) {
  if (el.type === 'image' && (el.width ?? 999) <= 200 && (el.height ?? 999) <= 100) return true;
  if (el.children) return el.children.some(c => hasSmallImage(c));
  return false;
}

function getTotalHeight(el) {
  // Estimate section height from padding + children
  let h = 0;
  if (typeof el.padding === 'number') h += el.padding * 2;
  else if (el.padding) h += (el.padding.top ?? 0) + (el.padding.bottom ?? 0);
  if (el.type === 'spacer') return el.height ?? 16;
  if (el.type === 'divider') return el.thickness ?? 1;
  if (el.children) {
    for (const c of el.children) h += getTotalHeight(c);
    h += (el.gap ?? 0) * Math.max(0, el.children.length - 1);
  }
  return h;
}

function categorizeSection(el, index, total) {
  if (el.type !== 'section') return null;

  const allText = collectAllText(el).join(' ');
  const types = collectTypes(el);
  const imageAlts = collectImageAlts(el);
  const buttonCount = countElements(el, 'button');
  const imageCount = countElements(el, 'image');
  const textCount = countElements(el, 'text');
  const dividerCount = countElements(el, 'divider');
  const spacerCount = countElements(el, 'spacer');
  const totalChildren = types.length - 1; // exclude the section itself

  // ── 1. Footer: last section(s) with footer keywords ──
  if (index >= total - 2 && FOOTER_KEYWORDS.some(kw => allText.includes(kw))) {
    return 'footer';
  }

  // ── 2. Social: multiple small images (icons) + social keywords ──
  const hasSocialKeywords = SOCIAL_KEYWORDS.some(kw => allText.includes(kw));
  const hasSocialImages = SOCIAL_IMAGE_PATTERNS.some(p => imageAlts.some(a => a.includes(p)));
  if ((hasSocialKeywords || hasSocialImages) && imageCount >= 2 && textCount <= 3) {
    return 'social';
  }

  // ── 3. Logo: first few sections, has image with logo-like alt or small image + minimal text ──
  if (index <= 1) {
    const hasLogoAlt = LOGO_IMAGE_PATTERNS.some(p => imageAlts.some(a => a.includes(p)));
    if (hasLogoAlt && imageCount <= 2 && textCount <= 2 && buttonCount === 0) {
      return 'logo';
    }
    // Small single image, almost no text = likely a logo bar
    if (imageCount === 1 && textCount <= 1 && buttonCount === 0 && hasSmallImage(el)) {
      return 'logo';
    }
  }

  // ── 4. Header: first section, few elements, no buttons (nav/preheader) ──
  if (index <= 1 && imageCount <= 2 && textCount <= 3 && buttonCount === 0) {
    return 'header';
  }

  // ── 5. Divider: very small section, mostly spacer/divider elements ──
  if (totalChildren <= 3 && (dividerCount + spacerCount) >= 1 && textCount === 0 && imageCount === 0 && buttonCount === 0) {
    return 'dividers';
  }
  // Also catch sections that are just very short with no real content
  const estHeight = getTotalHeight(el);
  if (totalChildren <= 2 && estHeight > 0 && estHeight <= 30 && textCount === 0 && imageCount === 0 && buttonCount === 0) {
    return 'dividers';
  }

  // ── 6. Hero: near top, large image dominates ──
  if (index <= 3 && hasLargeImage(el) && textCount <= 3 && buttonCount <= 1) {
    return 'hero';
  }

  // ── 7. Discount: sale/coupon/% off keywords ──
  const discountScore = DISCOUNT_KEYWORDS.filter(kw => allText.includes(kw)).length;
  if (discountScore >= 2) {
    return 'discounts';
  }

  // ── 8. Testimonial: quotes, reviews, stars ──
  const testimonialScore = TESTIMONIAL_KEYWORDS.filter(kw => allText.includes(kw)).length;
  if (testimonialScore >= 2) {
    return 'testimonials';
  }

  // ── 9. Comparison: pricing tiers, vs, plans ──
  const comparisonScore = COMPARISON_KEYWORDS.filter(kw => allText.includes(kw)).length;
  if (comparisonScore >= 2 || (comparisonScore >= 1 && el.direction === 'horizontal')) {
    return 'comparisons';
  }

  // ── 10. Benefits: feature lists, checkmarks, bullet points ──
  const benefitScore = BENEFIT_KEYWORDS.filter(kw => allText.includes(kw)).length;
  // Multiple small images (icons) + text items = benefit/feature list
  if (benefitScore >= 2) {
    return 'benefits';
  }
  if (imageCount >= 2 && textCount >= 3 && imageCount <= textCount && !hasLargeImage(el) && buttonCount === 0) {
    return 'benefits';
  }

  // ── 11. Products: multiple images with prices/shop keywords, or horizontal grid ──
  const productScore = PRODUCT_KEYWORDS.filter(kw => allText.includes(kw)).length;
  if (productScore >= 2 && imageCount >= 1) {
    return 'products';
  }
  if (el.direction === 'horizontal' && imageCount >= 2) {
    return 'products';
  }
  if (imageCount >= 3 && buttonCount >= 2) {
    return 'products';
  }

  // ── 12. CTA: section containing button(s), relatively few other elements ──
  if (buttonCount >= 1 && textCount <= 4) {
    return 'cta';
  }

  // ── 13. Single discount keyword + button = discount CTA ──
  if (discountScore >= 1 && buttonCount >= 1) {
    return 'discounts';
  }

  // ── Default: body ──
  return 'body';
}

function categorizeSections(elements) {
  // Only categorize top-level sections
  const total = elements.length;
  let categoryCounters = {};

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === 'section') {
      const category = categorizeSection(el, i, total);
      if (category) {
        el.category = category;
        categoryCounters[category] = (categoryCounters[category] ?? 0) + 1;
        el.sectionName = `${category.charAt(0).toUpperCase() + category.slice(1)} ${categoryCounters[category]}`;
      }
    }
  }

  return elements;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function parseEmailHtml(html) {
  // Pre-inline CSS from <style> blocks into element style attributes.
  // This is critical for emails that use class-based styles (Mailchimp, Stripo, etc.)
  let processedHtml = html;
  try {
    processedHtml = juice(html, { removeStyleTags: true });
  } catch {
    // If juice fails on malformed HTML, fall back to original
  }

  const $ = cheerio.load(processedHtml);

  // Remove invisible/tracking elements (style tags already removed by juice)
  $('script, head, meta, link').remove();
  $('style').remove(); // In case juice didn't remove them
  $('[style*="display:none"], [style*="display: none"]').remove();
  $('img[width="1"][height="1"], img[width="0"], img[height="0"]').remove();

  // ── Strategy 1: MJML/Klaviyo pattern ──
  const allMjmlDivs = [];
  $('div').each((_, el) => {
    const mw = parsePx($(el).css('max-width'));
    if (mw && mw >= 500 && mw <= 800) {
      const childTable = $(el).children('table').first();
      if (childTable.length) allMjmlDivs.push({ div: el, table: childTable[0] });
    }
  });

  // Filter: keep only top-level divs (no ancestor in the list)
  const mjmlDivElems = new Set(allMjmlDivs.map(d => d.div));
  const mjmlDivs = allMjmlDivs.filter(({ div }) => {
    let parent = div.parent;
    while (parent) {
      if (mjmlDivElems.has(parent)) return false;
      parent = parent.parent;
    }
    return true;
  });

  if (mjmlDivs.length > 0) {
    const allElements = [];
    for (const { div, table } of mjmlDivs) {
      const section = processTable($, table);
      if (section) {
        // Check for outer background from wrapper elements
        const outerBg = getEffectiveBgColor($, div.parent);
        if (outerBg && !section.backgroundColor) section.backgroundColor = outerBg;
        allElements.push(...(section.children ?? [section]));
      }
    }
    const width = mjmlDivs[0] ? (parsePx($(mjmlDivs[0].div).css('max-width')) ?? 600) : 600;
    const elements = categorizeSections(flattenElements(allElements));
    return { schemaVersion: 1, width, elements };
  }

  // ── Strategy 2: Multi-row emails (Stripo, Mailchimp) ──
  const wrapperTable = $('table[width="100%"], table').filter((_, el) => {
    const w = $(el).attr('width');
    return w === '100%';
  }).first();

  if (wrapperTable.length) {
    const allContentElements = [];
    let detectedWidth = 600;

    wrapperTable.find('table').each((_, el) => {
      const w = getWidth($(el));
      if (w && w >= 500 && w <= 800) {
        // Check this table isn't nested inside another content table
        let isNested = false;
        let p = el.parent;
        while (p && p !== wrapperTable[0]) {
          if (p.name === 'table') {
            const pw = getWidth($(p));
            if (pw && pw >= 500 && pw <= 800) { isNested = true; break; }
          }
          p = p.parent;
        }
        if (!isNested) {
          detectedWidth = w;
          const section = processTable($, el);
          if (section) {
            // Check parent td/tr for background color
            const parentBg = getEffectiveBgColor($, el.parent);
            if (parentBg && !section.backgroundColor) section.backgroundColor = parentBg;
            allContentElements.push(...(section.children ?? [section]));
          }
        }
      }
    });

    if (allContentElements.length > 0) {
      const elements = categorizeSections(flattenElements(allContentElements));
      return { schemaVersion: 1, width: detectedWidth, elements };
    }
  }

  // ── Strategy 3: Classic single-table emails ──
  const mainTable = findMainTable($);

  if (mainTable) {
    const $main = $(mainTable);
    const width = getWidth($main) ?? 600;
    const section = processTable($, mainTable);
    const elements = categorizeSections(flattenElements(section ? (section.children ?? []) : []));
    if (elements.length > 0) {
      return { schemaVersion: 1, width, elements };
    }
  }

  // ── Strategy 4: Body fallback ──
  const bodyElements = [];
  const bodyChildren = $('body').children().toArray();
  for (const child of bodyChildren) {
    if (child.type === 'tag') {
      bodyElements.push(...extractElementsFromNode($, child));
    }
  }
  return { schemaVersion: 1, width: 600, elements: categorizeSections(flattenElements(bodyElements)) };
}
