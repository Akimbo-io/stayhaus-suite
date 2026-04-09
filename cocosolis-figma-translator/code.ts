// Figma Design Translator Plugin
// Matches text by CONTENT (not layer names), duplicates frame per language

figma.showUI(__html__, { width: 400, height: 340, themeColors: false });

interface TranslationRow {
  sourceText: string;
  translations: Record<string, string>;
}

interface TranslationData {
  sourceLang: string;
  targetLangs: string[];
  rows: TranslationRow[];
}

// Find all text nodes recursively
function findTextNodes(node: SceneNode): TextNode[] {
  const texts: TextNode[] = [];
  if (node.type === "TEXT") {
    texts.push(node);
  }
  if ("children" in node) {
    for (const child of node.children) {
      texts.push(...findTextNodes(child));
    }
  }
  return texts;
}

// Collect all unique fonts in a text node
function collectFonts(node: TextNode): FontName[] {
  const fonts: FontName[] = [];
  const len = node.characters.length;
  if (len === 0) {
    const f = node.fontName;
    if (f !== figma.mixed) fonts.push(f);
    return fonts;
  }
  const seen = new Set<string>();
  for (let i = 0; i < len; i++) {
    const f = node.getRangeFontName(i, i + 1) as FontName;
    const key = `${f.family}::${f.style}`;
    if (!seen.has(key)) {
      seen.add(key);
      fonts.push(f);
    }
  }
  return fonts;
}

// Load all fonts for text nodes in a subtree
async function loadFontsForNode(node: SceneNode): Promise<void> {
  const textNodes = findTextNodes(node);
  const fontsToLoad = new Set<string>();
  const fontObjects: FontName[] = [];
  for (const tn of textNodes) {
    for (const f of collectFonts(tn)) {
      const key = `${f.family}::${f.style}`;
      if (!fontsToLoad.has(key)) {
        fontsToLoad.add(key);
        fontObjects.push(f);
      }
    }
  }
  await Promise.all(fontObjects.map((f) => figma.loadFontAsync(f)));
}

// Normalize text for matching: trim, collapse whitespace, lowercase, strip trailing punctuation
function normalize(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.\s]+$/, "");  // strip trailing dots and spaces
}

// Build content -> TextNode[] map from a frame
function buildContentMap(node: SceneNode): Map<string, TextNode[]> {
  const map = new Map<string, TextNode[]>();
  const textNodes = findTextNodes(node);
  for (const tn of textNodes) {
    const key = normalize(tn.characters);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tn);
  }
  return map;
}

figma.ui.onmessage = async (msg: any) => {
  // ── TRANSLATE ──
  if (msg.type === "translate") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: "error", message: "Select a frame first." });
      return;
    }
    const sourceFrame = selection[0];
    if (!("children" in sourceFrame)) {
      figma.ui.postMessage({ type: "error", message: "Select a Frame, Group, or Component." });
      return;
    }

    const data: TranslationData = msg.data;
    const autoResize: string = msg.autoResize || "height";
    const emailMeta: { label: string; translations: Record<string, string> }[] | null = msg.emailMeta || null;

    figma.ui.postMessage({ type: "status", message: "Loading fonts..." });
    await loadFontsForNode(sourceFrame);

    // Load Inter font for email meta labels
    if (emailMeta && emailMeta.length > 0) {
      try {
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      } catch (_) {
        // Inter might not be available, that's ok
      }
    }

    const createdFrames: SceneNode[] = [];
    let totalReplaced = 0;
    let totalMissed = 0;

    for (let li = 0; li < data.targetLangs.length; li++) {
      const lang = data.targetLangs[li];
      figma.ui.postMessage({
        type: "status",
        message: `Creating ${lang.toUpperCase()} (${li + 1}/${data.targetLangs.length})...`,
      });

      const clone = sourceFrame.clone();
      clone.name = `${sourceFrame.name} — ${lang.toUpperCase()}`;
      clone.x = sourceFrame.x;

      // If email mode with meta, leave space above the frame for the meta block
      const metaBlockHeight = (emailMeta && emailMeta.length > 0) ? 100 : 0;
      clone.y = sourceFrame.y + (sourceFrame.height + metaBlockHeight + 80) * (li + 1);

      await loadFontsForNode(clone);

      // Build a map of normalized source text -> text nodes in the clone
      const contentMap = buildContentMap(clone);

      let replaced = 0;
      let missed = 0;

      for (const row of data.rows) {
        const translation = row.translations[lang];
        if (!translation) continue;

        const sourceKey = normalize(row.sourceText);
        const nodes = contentMap.get(sourceKey);

        if (nodes && nodes.length > 0) {
          for (const textNode of nodes) {
            textNode.characters = translation;
            if (autoResize === "height") {
              textNode.textAutoResize = "HEIGHT";
            } else if (autoResize === "both") {
              textNode.textAutoResize = "WIDTH_AND_HEIGHT";
            } else if (autoResize === "truncate") {
              textNode.textAutoResize = "TRUNCATE";
            }
          }
          replaced++;
        } else {
          missed++;
        }
      }

      // Add email meta (Subject Line + Preview Text) as a label frame above the clone
      if (emailMeta && emailMeta.length > 0) {
        const metaFrame = figma.createFrame();
        metaFrame.name = `Email Meta — ${lang.toUpperCase()}`;
        metaFrame.resize(clone.width, 1);
        metaFrame.x = clone.x;
        metaFrame.y = clone.y - metaBlockHeight - 10;
        metaFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.98, b: 0.9 } }];
        metaFrame.layoutMode = "VERTICAL";
        metaFrame.primaryAxisAlignItems = "MIN";
        metaFrame.counterAxisAlignItems = "MIN";
        metaFrame.paddingTop = 12;
        metaFrame.paddingBottom = 12;
        metaFrame.paddingLeft = 16;
        metaFrame.paddingRight = 16;
        metaFrame.itemSpacing = 6;
        metaFrame.cornerRadius = 8;
        metaFrame.primaryAxisSizingMode = "AUTO";
        metaFrame.layoutSizingHorizontal = "FIXED";

        const metaLabels = ["Subject Line", "Preview Text"];
        for (let mi = 0; mi < emailMeta.length; mi++) {
          const meta = emailMeta[mi];
          const metaLabel = meta.label || metaLabels[mi] || `Meta ${mi + 1}`;
          const metaText = meta.translations[lang] || meta.translations[data.sourceLang] || "";

          try {
            const labelNode = figma.createText();
            labelNode.fontName = { family: "Inter", style: "Bold" };
            labelNode.characters = `${metaLabel}:`;
            labelNode.fontSize = 11;
            labelNode.fills = [{ type: "SOLID", color: { r: 0.57, g: 0.25, b: 0.05 } }];
            labelNode.textAutoResize = "WIDTH_AND_HEIGHT";
            metaFrame.appendChild(labelNode);

            const valueNode = figma.createText();
            valueNode.fontName = { family: "Inter", style: "Regular" };
            valueNode.characters = metaText || "(empty)";
            valueNode.fontSize = 12;
            valueNode.fills = [{ type: "SOLID", color: { r: 0.17, g: 0.1, b: 0.01 } }];
            valueNode.textAutoResize = "HEIGHT";
            valueNode.resize(clone.width - 32, valueNode.height);
            valueNode.layoutSizingHorizontal = "FILL";
            metaFrame.appendChild(valueNode);
          } catch (_) {
            // If font fails, skip meta labels gracefully
          }
        }

        figma.currentPage.appendChild(metaFrame);
        createdFrames.push(metaFrame);
      }

      totalReplaced += replaced;
      totalMissed += missed;
      createdFrames.push(clone);
    }

    figma.currentPage.selection = createdFrames;
    figma.viewport.scrollAndZoomIntoView(createdFrames);

    const metaNote = emailMeta ? ` Subject & preview text shown above each frame.` : "";
    figma.ui.postMessage({
      type: "done",
      message: `Done! ${data.targetLangs.length} versions created. ${totalReplaced} texts replaced, ${totalMissed} not found.${metaNote}`,
    });
  }

  // ── SCAN ──
  if (msg.type === "scan") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: "scan-result", layers: [] });
      return;
    }
    const textNodes = findTextNodes(selection[0]);
    const layers = textNodes.map((tn) => ({
      name: tn.name,
      content: tn.characters.substring(0, 120),
    }));
    figma.ui.postMessage({ type: "scan-result", layers });
  }

  // ── CREATE SAMPLE ──
  if (msg.type === "create-sample") {
    figma.ui.postMessage({ type: "status", message: "Creating sample email..." });

    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });

    const email = figma.createFrame();
    email.name = "Email — EN";
    email.resize(600, 900);
    email.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    email.layoutMode = "VERTICAL";
    email.primaryAxisAlignItems = "MIN";
    email.counterAxisAlignItems = "CENTER";
    email.paddingTop = 0;
    email.paddingBottom = 40;
    email.paddingLeft = 0;
    email.paddingRight = 0;
    email.itemSpacing = 0;

    // Hero
    const hero = figma.createFrame();
    hero.name = "hero_section";
    hero.resize(600, 260);
    hero.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.94, b: 0.87 } }];
    hero.layoutMode = "VERTICAL";
    hero.primaryAxisAlignItems = "CENTER";
    hero.counterAxisAlignItems = "CENTER";
    hero.paddingTop = 40; hero.paddingBottom = 40;
    hero.paddingLeft = 40; hero.paddingRight = 40;
    hero.itemSpacing = 16;
    hero.layoutSizingHorizontal = "FILL";

    const logo = figma.createText();
    logo.fontName = { family: "Inter", style: "Bold" };
    logo.characters = "YOUR BRAND";
    logo.fontSize = 28;
    logo.fills = [{ type: "SOLID", color: { r: 0.33, g: 0.27, b: 0.2 } }];
    logo.textAlignHorizontal = "CENTER";
    logo.textAutoResize = "WIDTH_AND_HEIGHT";
    hero.appendChild(logo);

    const headline = figma.createText();
    headline.fontName = { family: "Inter", style: "Bold" };
    headline.characters = "Summer Glow Collection";
    headline.fontSize = 32;
    headline.fills = [{ type: "SOLID", color: { r: 0.15, g: 0.12, b: 0.1 } }];
    headline.textAlignHorizontal = "CENTER";
    headline.textAutoResize = "HEIGHT";
    headline.resize(520, headline.height);
    headline.layoutSizingHorizontal = "FILL";
    hero.appendChild(headline);

    const subheadline = figma.createText();
    subheadline.fontName = { family: "Inter", style: "Regular" };
    subheadline.characters = "Premium products for the modern lifestyle";
    subheadline.fontSize = 16;
    subheadline.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.35, b: 0.3 } }];
    subheadline.textAlignHorizontal = "CENTER";
    subheadline.textAutoResize = "HEIGHT";
    subheadline.resize(520, subheadline.height);
    subheadline.layoutSizingHorizontal = "FILL";
    hero.appendChild(subheadline);
    email.appendChild(hero);

    // Body
    const body = figma.createFrame();
    body.name = "body_section";
    body.resize(600, 200);
    body.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    body.layoutMode = "VERTICAL";
    body.primaryAxisAlignItems = "CENTER";
    body.counterAxisAlignItems = "CENTER";
    body.paddingTop = 32; body.paddingBottom = 32;
    body.paddingLeft = 40; body.paddingRight = 40;
    body.itemSpacing = 24;
    body.layoutSizingHorizontal = "FILL";
    body.primaryAxisSizingMode = "AUTO";

    const bodyText = figma.createText();
    bodyText.fontName = { family: "Inter", style: "Regular" };
    bodyText.characters = "Discover our new summer essentials — lightweight, hydrating formulas that protect and nourish your skin all day long.";
    bodyText.fontSize = 15;
    bodyText.lineHeight = { value: 24, unit: "PIXELS" };
    bodyText.fills = [{ type: "SOLID", color: { r: 0.3, g: 0.3, b: 0.3 } }];
    bodyText.textAlignHorizontal = "CENTER";
    bodyText.textAutoResize = "HEIGHT";
    bodyText.resize(520, bodyText.height);
    bodyText.layoutSizingHorizontal = "FILL";
    body.appendChild(bodyText);

    const btnFrame = figma.createFrame();
    btnFrame.name = "cta_wrapper";
    btnFrame.fills = [{ type: "SOLID", color: { r: 0.33, g: 0.27, b: 0.2 } }];
    btnFrame.cornerRadius = 8;
    btnFrame.layoutMode = "HORIZONTAL";
    btnFrame.primaryAxisAlignItems = "CENTER";
    btnFrame.counterAxisAlignItems = "CENTER";
    btnFrame.paddingTop = 14; btnFrame.paddingBottom = 14;
    btnFrame.paddingLeft = 40; btnFrame.paddingRight = 40;
    btnFrame.primaryAxisSizingMode = "AUTO";
    btnFrame.counterAxisSizingMode = "AUTO";

    const ctaText = figma.createText();
    ctaText.fontName = { family: "Inter", style: "Bold" };
    ctaText.characters = "Shop Now";
    ctaText.fontSize = 16;
    ctaText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    ctaText.textAutoResize = "WIDTH_AND_HEIGHT";
    btnFrame.appendChild(ctaText);
    body.appendChild(btnFrame);
    email.appendChild(body);

    // Footer
    const footer = figma.createFrame();
    footer.name = "footer_section";
    footer.resize(600, 120);
    footer.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.95 } }];
    footer.layoutMode = "VERTICAL";
    footer.primaryAxisAlignItems = "CENTER";
    footer.counterAxisAlignItems = "CENTER";
    footer.paddingTop = 24; footer.paddingBottom = 24;
    footer.paddingLeft = 40; footer.paddingRight = 40;
    footer.itemSpacing = 12;
    footer.layoutSizingHorizontal = "FILL";
    footer.primaryAxisSizingMode = "AUTO";

    const footerText = figma.createText();
    footerText.fontName = { family: "Inter", style: "Regular" };
    footerText.characters = "Free shipping on orders over €50";
    footerText.fontSize = 13;
    footerText.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];
    footerText.textAlignHorizontal = "CENTER";
    footerText.textAutoResize = "WIDTH_AND_HEIGHT";
    footer.appendChild(footerText);

    const unsub = figma.createText();
    unsub.fontName = { family: "Inter", style: "Regular" };
    unsub.characters = "Unsubscribe from this list";
    unsub.fontSize = 11;
    unsub.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6 } }];
    unsub.textAlignHorizontal = "CENTER";
    unsub.textAutoResize = "WIDTH_AND_HEIGHT";
    unsub.textDecoration = "UNDERLINE";
    footer.appendChild(unsub);
    email.appendChild(footer);

    figma.currentPage.appendChild(email);
    figma.currentPage.selection = [email];
    figma.viewport.scrollAndZoomIntoView([email]);

    figma.ui.postMessage({
      type: "done",
      message: "Sample email created! Select it, upload CSV, and translate.",
    });
  }

  // ── RESIZE ──
  if (msg.type === "resize") {
    const h = Math.max(200, Math.min(msg.height || 340, 800));
    figma.ui.resize(400, h);
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};
