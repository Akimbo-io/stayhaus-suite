import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const PORT = 3055;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.url === '/emails') {
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json'));
    const emails = files.map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf-8'));
      return { filename: f, meta: data.meta };
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

  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Email Remixer server running at http://localhost:${PORT}`);
});
