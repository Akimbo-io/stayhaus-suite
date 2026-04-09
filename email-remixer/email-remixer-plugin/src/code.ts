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
}

interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontSize?: number;
  fontWeight?: number | string;
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
}

interface ButtonElement extends BaseElement {
  type: 'button';
  label: string;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number | string;
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

function getFontName(weight?: number | string): FontName {
  const w = typeof weight === 'string' ? parseInt(weight, 10) : weight ?? 400;
  return { family: 'Inter', style: w >= 600 ? 'Bold' : 'Regular' };
}

function getFontNameRoboto(weight?: number | string): FontName {
  const w = typeof weight === 'string' ? parseInt(weight, 10) : weight ?? 400;
  return { family: 'Roboto', style: w >= 600 ? 'Bold' : 'Regular' };
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

async function loadFonts(): Promise<void> {
  try {
    await Promise.all([
      figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
      figma.loadFontAsync({ family: 'Inter', style: 'Bold' }),
    ]);
    useRobotoFallback = false;
  } catch {
    try {
      await Promise.all([
        figma.loadFontAsync({ family: 'Roboto', style: 'Regular' }),
        figma.loadFontAsync({ family: 'Roboto', style: 'Bold' }),
      ]);
      useRobotoFallback = true;
    } catch (err) {
      throw new Error(`Could not load fonts: ${err}`);
    }
  }
}

function resolvedFontName(weight?: number | string): FontName {
  return useRobotoFallback ? getFontNameRoboto(weight) : getFontName(weight);
}

// ── Element builders ───────────────────────────────────────────────────────

async function buildText(el: TextElement, parentWidth: number): Promise<TextNode> {
  const node = figma.createText();
  node.fontName = resolvedFontName(el.fontWeight);
  node.characters = el.content ?? '';
  node.fontSize = el.fontSize ?? 14;
  node.textAlignHorizontal = getAlignment(el.align);

  if (el.color) {
    const rgb = hexToRgb(el.color);
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
  const bgRgb = hexToRgb(bg);
  frame.fills = [{ type: 'SOLID', color: bgRgb }];

  // Label
  const text = figma.createText();
  text.fontName = resolvedFontName(el.fontWeight ?? 600);
  text.characters = el.label;
  text.fontSize = el.fontSize ?? 14;
  text.textAlignHorizontal = 'CENTER';

  const tc = el.textColor ?? '#ffffff';
  text.fills = [{ type: 'SOLID', color: hexToRgb(tc) }];

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
  const color = el.color ? hexToRgb(el.color) : { r: 0.85, g: 0.85, b: 0.85 };
  node.fills = [{ type: 'SOLID', color }];
  return node;
}

async function buildSection(el: SectionElement, parentWidth: number): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = 'Section';

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
    frame.fills = [{ type: 'SOLID', color: hexToRgb(el.backgroundColor) }];
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

// ── Main import function ───────────────────────────────────────────────────

async function importEmail(data: EmailData): Promise<void> {
  await loadFonts();

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

// ── Entry point ────────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 320, height: 220 });

figma.ui.onmessage = async (msg: { type: string; data?: EmailData }) => {
  if (msg.type === 'import' && msg.data) {
    try {
      await importEmail(msg.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      figma.ui.postMessage({ type: 'error', message });
    }
  }
};
