import * as cheerio from 'cheerio';

// ── CSS helpers ──────────────────────────────────────────────────────────────

function parseStyle(styleStr) {
  if (!styleStr) return {};
  const result = {};
  for (const declaration of styleStr.split(';')) {
    const colonIndex = declaration.indexOf(':');
    if (colonIndex === -1) continue;
    const prop = declaration.slice(0, colonIndex).trim().toLowerCase();
    const val = declaration.slice(colonIndex + 1).trim();
    if (prop && val) result[prop] = val;
  }
  return result;
}

function parsePx(val) {
  if (!val) return null;
  const match = String(val).match(/^([\d.]+)(px)?$/);
  return match ? parseFloat(match[1]) : null;
}

function parseColor(val) {
  if (!val) return null;
  const v = val.trim();
  if (v === 'transparent' || v === 'none') return null;
  return v;
}

// Get background color from element — checks style, bgcolor attr, background attr
function getBgColor($el) {
  const style = parseStyle($el.attr('style'));
  return (
    parseColor(style['background-color']) ||
    parseColor(style['background']) ||
    parseColor($el.attr('bgcolor')) ||
    null
  );
}

// Get numeric width from element — checks width attr and style
function getWidth($el) {
  const wAttr = $el.attr('width');
  if (wAttr) {
    const n = parsePx(wAttr);
    if (n) return n;
  }
  const style = parseStyle($el.attr('style'));
  return (
    parsePx(style['width']) ||
    parsePx(style['max-width']) ||
    null
  );
}

function getPadding($el) {
  const style = parseStyle($el.attr('style'));
  const all = parsePx(style['padding']);
  if (all) return all;
  const top = parsePx(style['padding-top']) ?? 0;
  const right = parsePx(style['padding-right']) ?? 0;
  const bottom = parsePx(style['padding-bottom']) ?? 0;
  const left = parsePx(style['padding-left']) ?? 0;
  if (top || right || bottom || left) return { top, right, bottom, left };
  return null;
}

const HEADING_SIZES = { h1: 36, h2: 28, h3: 22, h4: 18, h5: 16, h6: 14 };

function isButtonStyle(style) {
  return !!(
    style['background-color'] &&
    (style['padding'] || style['padding-top'] || style['border-radius'])
  );
}

// ── Find the main email table ────────────────────────────────────────────────

function findMainTable($) {
  // Strategy 0: MJML/Klaviyo pattern — div with max-width ~600 containing a table
  let mjmlTable = null;
  $('div').each((_, el) => {
    const style = parseStyle($(el).attr('style'));
    const mw = parsePx(style['max-width']);
    if (mw && mw >= 500 && mw <= 800) {
      const t = $(el).children('table').first();
      if (t.length) { mjmlTable = t[0]; return false; }
    }
  });
  if (mjmlTable) return mjmlTable;

  // Strategy 1: explicit width=600 or 640
  for (const w of ['600', '640', '580', '700']) {
    const t = $(`table[width="${w}"]`).first();
    if (t.length) return t[0];
  }

  // Strategy 2: max-width or width in style
  let best = null;
  $('table').each((_, el) => {
    const style = parseStyle($(el).attr('style'));
    const w = parsePx(style['width']) || parsePx(style['max-width']);
    if (w && w >= 500 && w <= 800) { best = el; return false; }
  });
  if (best) return best;

  // Strategy 3: align=center
  const byAlign = $('table[align="center"]').first();
  if (byAlign.length) return byAlign[0];

  // Strategy 4: largest table in body (most rows)
  let maxRows = 0;
  let largest = null;
  $('body table').each((_, el) => {
    const rows = $(el).find('tr').length;
    if (rows > maxRows) { maxRows = rows; largest = el; }
  });
  if (largest) return largest;

  // Strategy 5: first table at all
  const first = $('table').first();
  return first.length ? first[0] : null;
}

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
      elements.push(el);
    }
    return elements;
  }

  // ── anchor / button ──
  if (tag === 'a') {
    const style = parseStyle($el.attr('style'));
    const href = $el.attr('href') || '';
    const label = $el.text().trim();

    // If anchor wraps an image with no text, extract the image
    const imgChild = $el.find('img').first();
    if (!label && imgChild.length) {
      return extractElementsFromNode($, imgChild[0]);
    }

    if (label && isButtonStyle(style)) {
      const el = { type: 'button', label, href };
      if (style['background-color']) el.backgroundColor = style['background-color'];
      if (style['color']) el.textColor = style['color'];
      const fs = parsePx(style['font-size']);
      if (fs) el.fontSize = fs;
      const br = parsePx(style['border-radius']);
      if (br) el.cornerRadius = br;
      elements.push(el);
      return elements;
    }

    // Inline link — treat as text if it has visible content
    if (label) {
      const el = { type: 'text', content: label };
      if (style['color']) el.color = style['color'];
      const fs = parsePx(style['font-size']);
      if (fs) el.fontSize = fs;
      elements.push(el);
    }
    return elements;
  }

  // ── headings ──
  if (HEADING_SIZES[tag]) {
    const style = parseStyle($el.attr('style'));
    const content = $el.text().trim();
    if (content) {
      const el = {
        type: 'text',
        content,
        fontSize: parsePx(style['font-size']) ?? HEADING_SIZES[tag],
        fontWeight: parsePx(style['font-weight']) ?? 700,
      };
      if (style['color']) el.color = style['color'];
      if (style['text-align']) el.align = style['text-align'];
      elements.push(el);
    }
    return elements;
  }

  // ── hr ──
  if (tag === 'hr') {
    const style = parseStyle($el.attr('style'));
    const el = { type: 'divider' };
    if (style['border-color'] || style['color']) el.color = style['border-color'] || style['color'];
    elements.push(el);
    return elements;
  }

  // ── p / span / div / td / th ──
  if (['p', 'span', 'div', 'td', 'th', 'li'].includes(tag)) {
    const style = parseStyle($el.attr('style'));
    const children = $el.children().toArray();
    const childTags = children.map(c => c.name?.toLowerCase()).filter(Boolean);

    // Single <a> child → always delegate (handles buttons, image links, and text links)
    if (childTags.length === 1 && childTags[0] === 'a') {
      return extractElementsFromNode($, $el.children('a')[0]);
    }

    // Has nested table → delegate to table
    if (childTags.includes('table')) {
      const tableNode = $el.children('table')[0] || $el.find('table').first()[0];
      if (tableNode) return extractElementsFromNode($, tableNode);
    }

    // Has img → extract img (and any other children)
    if (childTags.includes('img')) {
      for (const child of children) {
        elements.push(...extractElementsFromNode($, child));
      }
      return elements;
    }

    // Has multiple block children → recurse
    const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table'];
    if (children.some(c => blockTags.includes(c.name?.toLowerCase()))) {
      for (const child of children) {
        if (child.type === 'tag') elements.push(...extractElementsFromNode($, child));
      }
      return elements;
    }

    // Text content
    const text = $el.text().trim().replace(/\s+/g, ' ');
    if (text) {
      const el = { type: 'text', content: text };
      const fs = parsePx(style['font-size']);
      if (fs) el.fontSize = fs;
      const fw = style['font-weight'];
      if (fw) el.fontWeight = fw;
      const color = style['color'];
      if (color) el.color = color;
      const align = style['text-align'];
      if (align) el.align = align;
      const lh = parseFloat(style['line-height']);
      if (!isNaN(lh)) el.lineHeight = lh;
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

      // Wrap in section if it has background or padding
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

// ── Public API ───────────────────────────────────────────────────────────────

export function parseEmailHtml(html) {
  const $ = cheerio.load(html);

  // Remove invisible/tracking elements
  $('style, script, head, meta, link').remove();
  $('[style*="display:none"], [style*="display: none"]').remove();
  $('img[width="1"][height="1"], img[width="0"], img[height="0"]').remove();

  // MJML/Klaviyo pattern: multiple div[max-width:600px] containers, each with a child table
  // Process all of them to capture every section (header, body, footer, etc.)
  // Only keep outermost containers (exclude nested div[max-width] inside another)
  const allMjmlDivs = [];
  $('div').each((_, el) => {
    const style = parseStyle($(el).attr('style'));
    const mw = parsePx(style['max-width']);
    if (mw && mw >= 500 && mw <= 800) {
      const childTable = $(el).children('table').first();
      if (childTable.length) allMjmlDivs.push({ div: el, table: childTable[0] });
    }
  });

  // Filter: keep only divs that have no ancestor also in the list
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
        // Pick up any background set on the outer table that wraps this div
        const outerBg = getBgColor($(div).parent('td').parent('tr').parent('tbody').parent('table'));
        if (outerBg && !section.backgroundColor) section.backgroundColor = outerBg;
        allElements.push(...(section.children ?? [section]));
      }
    }
    const width = mjmlDivs[0] ? (parsePx(parseStyle($(mjmlDivs[0].div).attr('style'))['max-width']) ?? 600) : 600;
    return { schemaVersion: 1, width, elements: flattenElements(allElements) };
  }

  // Classic single-table emails
  const mainTable = findMainTable($);

  if (!mainTable) {
    // Fallback: extract from body directly
    const bodyElements = [];
    $('body').children().each((_, el) => {
      bodyElements.push(...extractElementsFromNode($, el));
    });
    return { schemaVersion: 1, width: null, elements: flattenElements(bodyElements) };
  }

  const $main = $(mainTable);
  const width = getWidth($main) ?? 600;
  const section = processTable($, mainTable);
  const elements = flattenElements(section ? (section.children ?? []) : []);

  return { schemaVersion: 1, width, elements };
}
