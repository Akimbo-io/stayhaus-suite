// ── Types ──────────────────────────────────────────────────────────────────

interface EmailMeta {
  subject: string;
  sender: string;
  date: string;
}

interface BaseElement {
  type: string;
  id?: string;
}

interface SectionElement extends BaseElement {
  type: 'section';
  direction?: 'vertical' | 'horizontal';
  backgroundColor?: string;
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  gap?: number;
  width?: number;
  children?: EmailElement[];
  category?: string;
  sectionName?: string;
}

interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  color?: string;
  align?: string;
  lineHeight?: number;
  letterSpacing?: number;
  width?: number;
}

interface ImageElement extends BaseElement {
  type: 'image';
  src?: string;
  base64?: string;
  width?: number;
  height?: number;
  altText?: string;
  cornerRadius?: number;
}

interface ButtonElement extends BaseElement {
  type: 'button';
  label: string;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  cornerRadius?: number;
  paddingH?: number;
  paddingV?: number;
  width?: number;
}

interface SpacerElement extends BaseElement {
  type: 'spacer';
  height?: number;
  width?: number;
}

interface DividerElement extends BaseElement {
  type: 'divider';
  color?: string;
  thickness?: number;
  width?: number;
}

type EmailElement =
  | SectionElement
  | TextElement
  | ImageElement
  | ButtonElement
  | SpacerElement
  | DividerElement;

interface EmailData {
  meta: EmailMeta;
  elements: EmailElement[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', blue: '#0000ff',
  green: '#008000', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  pink: '#ffc0cb', grey: '#808080', gray: '#808080', navy: '#000080',
  teal: '#008080', aqua: '#00ffff', maroon: '#800000', olive: '#808000',
  silver: '#c0c0c0', lime: '#00ff00', fuchsia: '#ff00ff', cyan: '#00ffff',
  coral: '#ff7f50', crimson: '#dc143c', darkblue: '#00008b', darkgreen: '#006400',
  darkgray: '#a9a9a9', darkgrey: '#a9a9a9', darkred: '#8b0000', gold: '#ffd700',
  indigo: '#4b0082', khaki: '#f0e68c', lavender: '#e6e6fa', lightblue: '#add8e6',
  lightgray: '#d3d3d3', lightgrey: '#d3d3d3', lightgreen: '#90ee90',
  midnightblue: '#191970', orangered: '#ff4500', royalblue: '#4169e1',
  salmon: '#fa8072', skyblue: '#87ceeb', steelblue: '#4682b4', tomato: '#ff6347',
  turquoise: '#40e0d0', violet: '#ee82ee',
};

function parseColorToRgb(color: string): { r: number; g: number; b: number } {
  const c = color.trim();

  // Handle rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) {
    return {
      r: parseFloat(rgbMatch[1]) / 255,
      g: parseFloat(rgbMatch[2]) / 255,
      b: parseFloat(rgbMatch[3]) / 255,
    };
  }

  // Handle named colors
  const named = NAMED_COLORS[c.toLowerCase()];
  if (named) {
    return parseColorToRgb(named);
  }

  // Handle hex (#fff or #ffffff)
  const clean = c.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

function getAlignment(align?: string): 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' {
  switch (align) {
    case 'center':
      return 'CENTER';
    case 'right':
      return 'RIGHT';
    case 'justify':
      return 'JUSTIFIED';
    default:
      return 'LEFT';
  }
}

// ── Font loading ───────────────────────────────────────────────────────────

let useRobotoFallback = false;
const loadedFamilies = new Set<string>();

async function tryLoadFont(family: string): Promise<boolean> {
  try {
    await Promise.all([
      figma.loadFontAsync({ family, style: 'Regular' }),
      figma.loadFontAsync({ family, style: 'Bold' }),
    ]);
    loadedFamilies.add(family);
    return true;
  } catch {
    return false;
  }
}

async function loadFontsForData(data: EmailData): Promise<void> {
  // Collect unique font families from all elements
  const families = new Set<string>();
  function scan(elements: EmailElement[]) {
    for (const el of elements) {
      if ((el as any).fontFamily) families.add((el as any).fontFamily);
      if (el.type === 'section' && el.children) scan(el.children);
    }
  }
  scan(data.elements);

  // Try loading each email font
  for (const family of families) {
    await tryLoadFont(family);
  }

  // Always load fallback fonts
  if (await tryLoadFont('Inter')) {
    useRobotoFallback = false;
  } else if (await tryLoadFont('Roboto')) {
    useRobotoFallback = true;
  } else {
    throw new Error('Could not load fallback fonts (Inter or Roboto)');
  }
}

function resolvedFontName(weight?: number | string, fontFamily?: string): FontName {
  const w = typeof weight === 'string' ? parseInt(weight, 10) : weight ?? 400;
  const style = w >= 600 ? 'Bold' : 'Regular';

  if (fontFamily && loadedFamilies.has(fontFamily)) {
    return { family: fontFamily, style };
  }

  return useRobotoFallback
    ? { family: 'Roboto', style }
    : { family: 'Inter', style };
}

// ── Element builders ───────────────────────────────────────────────────────

async function buildText(el: TextElement, parentWidth: number): Promise<TextNode> {
  const node = figma.createText();
  node.fontName = resolvedFontName(el.fontWeight, el.fontFamily);
  node.characters = el.content ?? '';
  node.fontSize = el.fontSize ?? 14;
  node.textAlignHorizontal = getAlignment(el.align);

  if (el.color) {
    const rgb = parseColorToRgb(el.color);
    node.fills = [{ type: 'SOLID', color: rgb }];
  }

  const lh = el.lineHeight;
  if (lh !== undefined) {
    if (lh <= 5) {
      node.lineHeight = { unit: 'PERCENT', value: lh * 100 };
    } else {
      node.lineHeight = { unit: 'PIXELS', value: lh };
    }
  }

  if (el.letterSpacing !== undefined) {
    node.letterSpacing = { unit: 'PIXELS', value: el.letterSpacing };
  }

  const width = el.width ?? parentWidth;
  node.resize(width, node.height);
  node.textAutoResize = 'HEIGHT';

  return node;
}

async function buildImage(el: ImageElement, parentWidth: number): Promise<RectangleNode> {
  const node = figma.createRectangle();
  const displayW = Math.min(el.width ?? parentWidth, parentWidth);
  const displayH = el.height
    ? Math.round(el.height * (displayW / (el.width ?? displayW)))
    : 200;
  node.resize(displayW, displayH);
  node.name = el.altText ?? 'Image';

  if (el.cornerRadius) {
    node.cornerRadius = el.cornerRadius;
  }

  const rawData = el.base64 ?? el.src;
  if (rawData) {
    try {
      // Strip data URI prefix if present
      const base64 = rawData.replace(/^data:[^;]+;base64,/, '');
      const bytes = figma.base64Decode(base64);
      const image = figma.createImage(bytes);
      node.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
    } catch {
      // Fallback: light grey placeholder
      node.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
    }
  } else {
    node.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
  }

  return node;
}

async function buildButton(el: ButtonElement, parentWidth: number): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = `Button: ${el.label}`;
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisAlignItems = 'CENTER';
  frame.counterAxisAlignItems = 'CENTER';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';

  const pH = el.paddingH ?? 24;
  const pV = el.paddingV ?? 12;
  frame.paddingLeft = pH;
  frame.paddingRight = pH;
  frame.paddingTop = pV;
  frame.paddingBottom = pV;

  frame.cornerRadius = el.cornerRadius ?? 4;

  const bg = el.backgroundColor ?? '#18a0fb';
  const bgRgb = parseColorToRgb(bg);
  frame.fills = [{ type: 'SOLID', color: bgRgb }];

  // Label
  const text = figma.createText();
  text.fontName = resolvedFontName(el.fontWeight ?? 600, el.fontFamily);
  text.characters = el.label;
  text.fontSize = el.fontSize ?? 14;
  text.textAlignHorizontal = 'CENTER';

  const tc = el.textColor ?? '#ffffff';
  text.fills = [{ type: 'SOLID', color: parseColorToRgb(tc) }];

  frame.appendChild(text);

  // If explicit width given, switch to FIXED width
  if (el.width) {
    frame.primaryAxisSizingMode = 'FIXED';
    frame.resize(el.width, frame.height);
  }

  return frame;
}

async function buildSpacer(el: SpacerElement, parentWidth: number): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = 'Spacer';
  frame.fills = [];
  frame.resize(el.width ?? parentWidth, el.height ?? 16);
  return frame;
}

async function buildDivider(el: DividerElement, parentWidth: number): Promise<RectangleNode> {
  const node = figma.createRectangle();
  node.name = 'Divider';
  node.resize(el.width ?? parentWidth, el.thickness ?? 1);
  const color = el.color ? parseColorToRgb(el.color) : { r: 0.85, g: 0.85, b: 0.85 };
  node.fills = [{ type: 'SOLID', color }];
  return node;
}

async function buildSection(el: SectionElement, parentWidth: number): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = el.sectionName || 'Section';

  const direction = el.direction ?? 'vertical';
  frame.layoutMode = direction === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'FIXED';

  const width = el.width ?? parentWidth;
  frame.resize(width, 100); // height auto-grows

  // Padding
  if (el.padding !== undefined) {
    if (typeof el.padding === 'number') {
      frame.paddingTop = el.padding;
      frame.paddingRight = el.padding;
      frame.paddingBottom = el.padding;
      frame.paddingLeft = el.padding;
    } else {
      frame.paddingTop = el.padding.top ?? 0;
      frame.paddingRight = el.padding.right ?? 0;
      frame.paddingBottom = el.padding.bottom ?? 0;
      frame.paddingLeft = el.padding.left ?? 0;
    }
  }

  frame.itemSpacing = el.gap ?? 0;

  if (el.backgroundColor) {
    frame.fills = [{ type: 'SOLID', color: parseColorToRgb(el.backgroundColor) }];
  } else {
    frame.fills = [];
  }

  // Children
  const innerWidth =
    width -
    frame.paddingLeft -
    frame.paddingRight;

  for (const child of el.children ?? []) {
    const childNode = await buildElement(child, innerWidth);
    if (childNode) {
      frame.appendChild(childNode);
    }
  }

  return frame;
}

async function buildElement(
  el: EmailElement,
  parentWidth: number,
): Promise<SceneNode | null> {
  switch (el.type) {
    case 'section':
      return buildSection(el, parentWidth);
    case 'text':
      return buildText(el, parentWidth);
    case 'image':
      return buildImage(el, parentWidth);
    case 'button':
      return buildButton(el, parentWidth);
    case 'spacer':
      return buildSpacer(el, parentWidth);
    case 'divider':
      return buildDivider(el, parentWidth);
    default:
      return null;
  }
}

// ── Workspace scanning ──────────────────────────────────────────────────────

const VALID_CATEGORIES = [
  'logo', 'header', 'hero', 'cta', 'countdowns', 'body', 'footer',
  'social', 'products', 'dividers', 'benefits',
  'testimonials', 'comparisons', 'discounts',
] as const;

type SectionCategory = typeof VALID_CATEGORIES[number];

// Maps multi-word frame names (lowercased) → our internal category
const CATEGORY_NAME_MAP: Record<string, SectionCategory> = {
  // Exact matches — multi-word names
  'header logo': 'logo',
  'body text': 'body',
  'product card': 'products',
  'product cards': 'products',
  // Singular/plural normalization
  'header': 'header',
  'headers': 'header',
  'footer': 'footer',
  'footers': 'footer',
  'cta': 'cta',
  'hero': 'hero',
  'body': 'body',
  'social': 'social',
  'logo': 'logo',
  'divider': 'dividers',
  'dividers': 'dividers',
  'benefit': 'benefits',
  'benefits': 'benefits',
  'comparison': 'comparisons',
  'comparisons': 'comparisons',
  'discount': 'discounts',
  'discounts': 'discounts',
  'testimonial': 'testimonials',
  'testimonials': 'testimonials',
  'product': 'products',
  'products': 'products',
  // Aliases — names that map to existing categories
  'sale': 'discounts',
  'sales': 'discounts',
  'review': 'testimonials',
  'reviews': 'testimonials',
  'icons': 'social',
  'icon': 'social',
  'countdown': 'countdowns',
  'countdowns': 'countdowns',
  'timer': 'countdowns',
  'timers': 'countdowns',
};

interface WorkspaceSection {
  id: string;
  name: string;
  category: SectionCategory;
  number: number;
  width: number;
  height: number;
  contentHeight: number;
}

function getContentHeight(node: SceneNode): number {
  if ('absoluteRenderBounds' in node) {
    const rb = (node as FrameNode).absoluteRenderBounds;
    if (rb && rb.height > 0) return Math.round(rb.height);
  }
  return Math.round(node.height);
}

function resolveCategory(rawName: string): SectionCategory | null {
  const name = rawName.toLowerCase().trim();
  return CATEGORY_NAME_MAP[name] ?? null;
}

function scanWorkspaceSections(): Record<string, WorkspaceSection[]> {
  const result: Record<string, WorkspaceSection[]> = {};
  const patternWithNumber = /^(.+?)\s+(\d+)$/i;
  // Dedup by "category:number" — prevents counting the same section twice
  // (once as top-level frame and again inside an email template)
  const dedup = new Set<string>();
  const autoNumbers: Record<string, number> = {};

  // Track which top-level frames matched and which had children that also matched.
  // If a parent and its children both match, the parent is an organizational container
  // (e.g., a frame named "Header" containing "Header 1", "Header 2", ...) — remove it.
  const containerIds = new Set<string>();

  function tryMatch(node: SceneNode): boolean {
    if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return false;

    const trimmedName = node.name.trim();

    // Try "Category Name 123"
    const match = trimmedName.match(patternWithNumber);
    if (match) {
      const category = resolveCategory(match[1]);
      if (category) {
        const num = parseInt(match[2], 10);
        const key = category + ':' + num;
        if (dedup.has(key)) return true; // already have this one, skip
        dedup.add(key);
        if (!result[category]) result[category] = [];
        result[category].push({
          id: node.id,
          name: trimmedName,
          category,
          number: num,
          width: Math.round(node.width),
          height: Math.round(node.height),
          contentHeight: getContentHeight(node),
        });
        return true;
      }
    }

    // Try exact name without number (e.g., "Footer", "Header Logo")
    const categoryExact = resolveCategory(trimmedName);
    if (categoryExact) {
      const key = categoryExact + ':name:' + trimmedName.toLowerCase();
      if (dedup.has(key)) return true;
      dedup.add(key);
      autoNumbers[categoryExact] = (autoNumbers[categoryExact] ?? 0) + 1;
      if (!result[categoryExact]) result[categoryExact] = [];
      result[categoryExact].push({
        id: node.id,
        name: trimmedName,
        category: categoryExact,
        number: autoNumbers[categoryExact],
        width: Math.round(node.width),
        height: Math.round(node.height),
        contentHeight: getContentHeight(node),
      });
      return true;
    }

    return false;
  }

  // Smart scan with three cases:
  // 1. Unmatched top-level frame → scan children (sections inside imported emails, etc.)
  // 2. Numbered section (e.g., "Header 5") → real section, skip children (internal elements)
  // 3. Bare-name frame (e.g., "Header") → peek at children:
  //    - Same-category children found → it's a container/group → scan children, remove parent
  //    - No same-category children → standalone section → keep parent, skip children
  for (const topNode of figma.currentPage.children) {
    const node = topNode as SceneNode;
    const parentMatched = tryMatch(node);

    if (!parentMatched) {
      // Case 1: Not a section — check direct children
      if ('children' in node) {
        for (const child of (node as FrameNode).children) {
          tryMatch(child as SceneNode);
        }
      }
      continue;
    }

    // Parent matched — is it numbered ("Header 5") or bare ("Header")?
    const isBare = !node.name.trim().match(patternWithNumber);
    if (!isBare || !('children' in node)) continue; // Case 2: numbered → skip children

    // Case 3: Bare name — peek at children to see if any share the same category
    const parentCategory = resolveCategory(node.name.trim());
    let hasSameCategoryChild = false;

    for (const child of (node as FrameNode).children) {
      if (child.type !== 'FRAME' && child.type !== 'COMPONENT' && child.type !== 'INSTANCE') continue;
      const childName = child.name.trim();
      const childNumMatch = childName.match(patternWithNumber);
      const childBaseName = childNumMatch ? childNumMatch[1] : childName;
      const childCategory = resolveCategory(childBaseName);
      if (childCategory === parentCategory) {
        hasSameCategoryChild = true;
        break;
      }
    }

    if (hasSameCategoryChild) {
      // Container: scan all children, flag parent for removal
      containerIds.add(node.id);
      for (const child of (node as FrameNode).children) {
        tryMatch(child as SceneNode);
      }
    }
    // Otherwise: standalone bare section — keep parent, skip children
  }

  // Remove container parents from results
  if (containerIds.size > 0) {
    for (const cat of Object.keys(result)) {
      result[cat] = result[cat].filter(sec => !containerIds.has(sec.id));
      if (result[cat].length === 0) delete result[cat];
    }
  }

  // Suppress bare single-word sections when a more specific section uses the
  // same first token (e.g. "Header" when "Header Logo" or "Header 1" exists).
  // These are almost always labels/references, not distinct sections.
  const firstTokens = new Set<string>();
  for (const cat of Object.keys(result)) {
    for (const sec of result[cat]) {
      const n = sec.name.toLowerCase().trim();
      const sp = n.indexOf(' ');
      if (sp > 0) firstTokens.add(n.slice(0, sp));
    }
  }
  for (const cat of Object.keys(result)) {
    result[cat] = result[cat].filter(sec => {
      const n = sec.name.toLowerCase().trim();
      return n.includes(' ') || !firstTokens.has(n);
    });
    if (result[cat].length === 0) delete result[cat];
  }

  for (const cat of Object.keys(result)) {
    result[cat].sort((a, b) => a.number - b.number);
  }

  return result;
}

async function exportSectionThumbnails(
  sections: Record<string, WorkspaceSection[]>,
): Promise<void> {
  for (const secs of Object.values(sections)) {
    for (const sec of secs) {
      try {
        const node = figma.getNodeById(sec.id);
        if (node && 'exportAsync' in node) {
          const bytes = await (node as FrameNode).exportAsync({
            format: 'PNG',
            constraint: { type: 'WIDTH', value: 500 },
          });
          // Send each thumbnail immediately as it completes
          figma.ui.postMessage({
            type: 'workspace-thumbnail',
            id: sec.id,
            data: figma.base64Encode(bytes),
          });
        }
      } catch {
        // skip failed thumbnails
      }
    }
  }
}

// ── Font loading helpers for single-element builds ──────────────────────────

async function loadFallbackFonts(): Promise<void> {
  if (await tryLoadFont('Inter')) {
    useRobotoFallback = false;
  } else if (await tryLoadFont('Roboto')) {
    useRobotoFallback = true;
  } else {
    throw new Error('Could not load fallback fonts (Inter or Roboto)');
  }
}

async function loadFontsForElement(el: EmailElement): Promise<void> {
  const families = new Set<string>();
  function scan(element: EmailElement) {
    if ((element as any).fontFamily) families.add((element as any).fontFamily);
    if (element.type === 'section' && element.children) {
      for (const child of element.children) scan(child);
    }
  }
  scan(el);

  for (const family of families) {
    await tryLoadFont(family);
  }

  await loadFallbackFonts();
}

// ── Placement helper ────────────────────────────────────────────────────────

function getNextXPosition(): number {
  let startX = 0;
  for (const node of figma.currentPage.children) {
    const right = node.x + node.width + 100;
    if (right > startX) startX = right;
  }
  return startX;
}

// ── Main import function ───────────────────────────────────────────────────

async function importEmail(data: EmailData): Promise<void> {
  await loadFontsForData(data);

  const { meta, elements } = data;

  // Frame name: sender - subject - date
  const frameName = [meta.sender, meta.subject, meta.date]
    .filter(Boolean)
    .join(' - ');

  // Calculate x position: place to the right of existing content
  let startX = 0;
  for (const node of figma.currentPage.children) {
    const right = node.x + node.width + 100;
    if (right > startX) startX = right;
  }

  const EMAIL_WIDTH = 600;

  const emailFrame = figma.createFrame();
  emailFrame.name = frameName;
  emailFrame.layoutMode = 'VERTICAL';
  emailFrame.primaryAxisSizingMode = 'AUTO';
  emailFrame.counterAxisSizingMode = 'FIXED';
  emailFrame.resize(EMAIL_WIDTH, 100);
  emailFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  emailFrame.x = startX;
  emailFrame.y = 0;

  for (const el of elements) {
    const node = await buildElement(el, EMAIL_WIDTH);
    if (node) {
      emailFrame.appendChild(node);
    }
  }

  figma.currentPage.selection = [emailFrame];
  figma.viewport.scrollAndZoomIntoView([emailFrame]);

  figma.ui.postMessage({ type: 'done', subject: meta.subject });
}

// ── Import single section ───────────────────────────────────────────────────

async function importSection(sectionData: EmailElement, sectionName: string): Promise<void> {
  await loadFontsForElement(sectionData);

  const EMAIL_WIDTH = 600;
  const startX = getNextXPosition();

  const node = await buildElement(sectionData, EMAIL_WIDTH);
  if (!node) {
    throw new Error('Failed to build section from data');
  }

  node.name = sectionName;

  // If the node is not a top-level frame, wrap it
  if (node.type !== 'FRAME') {
    const wrapper = figma.createFrame();
    wrapper.name = sectionName;
    wrapper.layoutMode = 'VERTICAL';
    wrapper.primaryAxisSizingMode = 'AUTO';
    wrapper.counterAxisSizingMode = 'FIXED';
    wrapper.resize(EMAIL_WIDTH, 100);
    wrapper.fills = [];
    wrapper.appendChild(node);
    wrapper.x = startX;
    wrapper.y = 0;
    figma.currentPage.selection = [wrapper];
    figma.viewport.scrollAndZoomIntoView([wrapper]);
  } else {
    node.x = startX;
    node.y = 0;
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  }

  figma.ui.postMessage({ type: 'section-imported', name: sectionName });
}

// ── Compose email from sections ─────────────────────────────────────────────

interface ComposeSection {
  source: 'workspace' | 'server';
  nodeId?: string;
  sectionData?: EmailElement;
  sectionName: string;
}

async function composeEmail(sections: ComposeSection[], emailName: string): Promise<void> {
  const startX = getNextXPosition();

  // Pre-load fonts for all server-sourced sections
  for (const section of sections) {
    if (section.source === 'server' && section.sectionData) {
      await loadFontsForElement(section.sectionData);
    }
  }

  const emailFrame = figma.createFrame();
  emailFrame.name = emailName;
  emailFrame.layoutMode = 'VERTICAL';
  emailFrame.primaryAxisSizingMode = 'AUTO';
  emailFrame.counterAxisSizingMode = 'AUTO';
  emailFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  emailFrame.x = startX;
  emailFrame.y = 0;

  for (const section of sections) {
    let childNode: SceneNode | null = null;

    if (section.source === 'workspace' && section.nodeId) {
      // Clone existing workspace node
      const sourceNode = figma.getNodeById(section.nodeId) as SceneNode | null;
      if (sourceNode && sourceNode.type !== 'SLOT') {
        childNode = sourceNode.clone();
      }
    } else if (section.source === 'server' && section.sectionData) {
      // Build from section data
      childNode = await buildElement(section.sectionData, 600);
    }

    if (childNode) {
      childNode.name = section.sectionName;
      emailFrame.appendChild(childNode);
    }
  }

  figma.currentPage.selection = [emailFrame];
  figma.viewport.scrollAndZoomIntoView([emailFrame]);

  figma.ui.postMessage({ type: 'email-composed', name: emailName });
}

// ── Entry point ────────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 520, height: 760 });

figma.ui.onmessage = async (msg: {
  type: string;
  data?: EmailData;
  sectionData?: EmailElement;
  sectionName?: string;
  sections?: ComposeSection[];
  emailName?: string;
}) => {
  try {
    switch (msg.type) {
      case 'import':
        if (msg.data) {
          await importEmail(msg.data);
        }
        break;

      case 'scan-workspace': {
        const sections = scanWorkspaceSections();
        figma.ui.postMessage({ type: 'workspace-sections', sections });
        await exportSectionThumbnails(sections);
        figma.ui.postMessage({ type: 'workspace-thumbnails-complete' });
        break;
      }

      case 'import-section':
        if (msg.sectionData && msg.sectionName) {
          await importSection(msg.sectionData, msg.sectionName);
        }
        break;

      case 'compose-email':
        if (msg.sections && msg.emailName) {
          await composeEmail(msg.sections, msg.emailName);
        }
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    figma.ui.postMessage({ type: 'error', message });
  }
};
