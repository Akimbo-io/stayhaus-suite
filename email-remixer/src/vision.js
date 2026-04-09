import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a precise email design analyzer. Given an image of an email section, extract all visible design elements and return them as structured JSON.

Return ONLY valid JSON matching this schema exactly:
{
  "backgroundColor": "#rrggbb or null",
  "children": [
    // text element:
    { "type": "text", "content": "exact text", "fontSize": 16, "fontWeight": 400, "color": "#rrggbb", "align": "left|center|right" },
    // image element (for photos, illustrations, decorative images):
    { "type": "image", "altText": "brief description", "heightPx": 200 },
    // button/CTA:
    { "type": "button", "label": "exact label", "backgroundColor": "#rrggbb", "textColor": "#rrggbb", "cornerRadius": 4 },
    // horizontal rule:
    { "type": "divider", "color": "#rrggbb" }
  ]
}

Rules:
- Extract ALL visible text verbatim, preserving line breaks as separate text elements
- Estimate font sizes in px: body ~14-16px, subheading ~18-22px, heading ~24-36px, hero ~40-60px
- Use fontWeight 700 for bold/heading text, 400 for body
- For photos and product images that should remain as images, use type "image" with a brief altText description
- heightPx for image elements should be your best estimate of its pixel height at 600px email width
- Return null for backgroundColor if it's white or very light grey (no meaningful fill)
- Only include elements that add value — skip invisible spacers, tracking pixels
- Return ONLY the JSON object, no markdown, no explanation`;

export async function analyzeImageSection(base64DataUri, originalWidth, originalHeight) {
  const base64 = base64DataUri.replace(/^data:[^;]+;base64,/, '');
  const mediaType = base64DataUri.match(/^data:([^;]+);/)?.[1] ?? 'image/jpeg';

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          },
          {
            type: 'text',
            text: `This email section is ${originalWidth}px wide × ${originalHeight}px tall. Extract all design elements.`
          }
        ]
      }]
    });

    const text = response.content[0].text.trim();
    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('Vision analysis failed:', err.message);
    return null;
  }
}
