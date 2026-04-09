import { compose } from './lib/compose';
import type { Brand } from './lib/brands';

figma.showUI(__html__, { width: 360, height: 640, themeColors: false });

figma.ui.onmessage = async (msg: { type: string } & Record<string, unknown>) => {
  if (msg.type === 'generate') {
    try {
      const frame = await compose({
        brand: msg.brand as Brand,
        flow: msg.flow as string,
        sections: msg.sections as { section: string; variant: string }[],
        offer: (msg.offer as string) || '',
      });
      figma.ui.postMessage({ type: 'done', text: `Created ${frame.name}` });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      figma.ui.postMessage({ type: 'error', text: err });
      figma.notify(`Composer error: ${err}`, { error: true });
    }
  }
};
