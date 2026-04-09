import type { Brand } from './brands';
import { findComponent } from './library';

export interface SectionPick {
  section: string;
  variant: string;
}

export interface ComposeInput {
  brand: Brand;
  flow: string;
  sections: SectionPick[];
  offer: string;
}

/**
 * Walk a node and apply brand styling:
 * - For text nodes: swap font to brand heading/body
 * - For nodes bound to BRAND_PRIMARY/ACCENT/BG variables: rebind to overrides
 *
 * In 2a we apply font and color naively. Sophisticated variable binding
 * comes in a later iteration.
 */
async function applyBrandStyling(node: SceneNode, brand: Brand): Promise<void> {
  if ('children' in node) {
    for (const child of node.children) await applyBrandStyling(child, brand);
  }

  if (node.type === 'TEXT') {
    const text = node as TextNode;
    const isHeading = /HEADLINE|SUBHEAD|CTA_LABEL|OFFER_TEXT/i.test(text.name);
    const fontFamily = isHeading
      ? brand.guidelines.fonts.heading || 'Inter'
      : brand.guidelines.fonts.body || 'Inter';

    try {
      await figma.loadFontAsync({ family: fontFamily, style: 'Regular' });
      // Replace all font assignments in the text
      const len = text.characters.length;
      if (len > 0) {
        text.setRangeFontName(0, len, { family: fontFamily, style: 'Regular' });
      }
    } catch (e) {
      // Font not available — silently skip; designer sees default
    }
  }
}

export async function compose(input: ComposeInput): Promise<FrameNode> {
  const { brand, flow, sections, offer } = input;

  // Create the wrapper frame
  const frame = figma.createFrame();
  frame.name = `${brand.slug} / ${flow} / BG`;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 0;
  frame.fills = [];

  let missing: string[] = [];

  for (const pick of sections) {
    const component = await findComponent(flow, pick.section, pick.variant);
    if (!component) {
      missing.push(`${flow}/${pick.section}/${pick.variant}`);
      continue;
    }
    const instance = component.createInstance();
    frame.appendChild(instance);
    await applyBrandStyling(instance, brand);

    // If this is a hero or cta, set the OFFER_TEXT layer to the typed offer
    if (offer) {
      const offerLayer = (instance.findAll(n => n.name === 'OFFER_TEXT' && n.type === 'TEXT')[0]) as TextNode | undefined;
      if (offerLayer) {
        try {
          await figma.loadFontAsync(offerLayer.fontName as FontName);
          offerLayer.characters = offer;
        } catch {}
      }
    }
  }

  // Position frame in viewport
  frame.x = figma.viewport.center.x - frame.width / 2;
  frame.y = figma.viewport.center.y - frame.height / 2;
  figma.currentPage.appendChild(frame);
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);

  if (missing.length > 0) {
    figma.notify(`Missing variants: ${missing.join(', ')}`, { error: true });
  }

  return frame;
}
