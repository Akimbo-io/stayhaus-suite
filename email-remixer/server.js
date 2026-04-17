import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const PORT = 3055;

function getEmailPreviews(data, maxCount = 4, maxTotalBytes = 500_000) {
  if (!Array.isArray(data.elements)) return [];
  const out = [];
  let total = 0;
  const stack = [...data.elements];
  while (stack.length && out.length < maxCount) {
    const node = stack.shift();
    if (!node) continue;
    if (typeof node.base64 === 'string' && node.base64.length > 500) {
      if (out.length === 0 || total + node.base64.length <= maxTotalBytes) {
        out.push(node.base64);
        total += node.base64.length;
      }
    }
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return out;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.url === '/emails') {
    if (!fs.existsSync(OUTPUT_DIR)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
    const emails = files.map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf-8'));
      return { filename: f, meta: data.meta, previews: getEmailPreviews(data) };
    }).sort((a, b) => b.meta.date.localeCompare(a.meta.date));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(emails));

  } else if (req.url.startsWith('/email/')) {
    const filename = decodeURIComponent(req.url.replace('/email/', ''));
    const filepath = path.join(OUTPUT_DIR, filename);
    if (!fs.existsSync(filepath)) { res.writeHead(404); res.end('Not found'); return; }
    const data = fs.readFileSync(filepath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);

  } else if (req.url === '/sections') {
    if (!fs.existsSync(OUTPUT_DIR)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ categories: [], sections: {}, totalSections: 0 }));
      return;
    }
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
    const sections = {};
    let totalSections = 0;

    for (const f of files) {
      const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf-8'));
      const meta = data.meta || {};
      if (!Array.isArray(data.elements)) continue;

      data.elements.forEach((el, idx) => {
        if (!el.category) return;
        const cat = el.category;
        if (!sections[cat]) sections[cat] = [];

        const emailSlug = f.replace('.json', '');
        sections[cat].push({
          id: `${emailSlug}-${cat}-${sections[cat].length + 1}`,
          sectionName: el.sectionName || `${cat.charAt(0).toUpperCase() + cat.slice(1)} ${sections[cat].length + 1}`,
          category: cat,
          source: { filename: f, sender: meta.sender || '', subject: meta.subject || '' },
          elementIndex: idx,
          data: el
        });
        totalSections++;
      });
    }

    const categories = Object.keys(sections).sort();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ categories, sections, totalSections }));

  } else if (req.url.startsWith('/section/')) {
    // Format: /section/{emailFilename}/{elementIndex}
    const urlPath = decodeURIComponent(req.url.replace('/section/', ''));
    const lastSlash = urlPath.lastIndexOf('/');
    if (lastSlash === -1) { res.writeHead(400); res.end('Bad request: expected /section/{filename}/{index}'); return; }

    const filename = urlPath.substring(0, lastSlash);
    const indexStr = urlPath.substring(lastSlash + 1);
    const elementIndex = parseInt(indexStr, 10);

    if (isNaN(elementIndex)) { res.writeHead(400); res.end('Bad request: elementIndex must be a number'); return; }

    const filepath = path.join(OUTPUT_DIR, filename);
    if (!fs.existsSync(filepath)) { res.writeHead(404); res.end('Email file not found'); return; }

    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    if (!Array.isArray(data.elements) || elementIndex < 0 || elementIndex >= data.elements.length) {
      res.writeHead(404); res.end('Element index out of range'); return;
    }

    const element = data.elements[elementIndex];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      source: { filename, sender: data.meta?.sender || '', subject: data.meta?.subject || '' },
      elementIndex,
      data: element
    }));

  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Email Remixer server running at http://localhost:${PORT}`);
});
