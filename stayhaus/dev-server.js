import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3060;

const NOTION_TOKEN = process.env.NOTION_TOKEN || '';
const PARENT_PAGE_ID = process.env.PARENT_PAGE_ID || '';

if (!NOTION_TOKEN || !PARENT_PAGE_ID) {
  console.error('Set NOTION_TOKEN and PARENT_PAGE_ID environment variables');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let filePath;
    if (req.url === '/' || req.url === '/onboarding.html') {
      filePath = path.join(__dirname, 'onboarding.html');
    } else {
      filePath = path.join(__dirname, req.url);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': (types[ext] || 'text/plain') + '; charset=utf-8' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  if (req.method === 'POST' && (req.url === '/create-portal.php' || req.url === '/create-portal')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');

      const py = spawn('python3', [path.join(__dirname, 'create_portal.py')], {
        env: { ...process.env, NOTION_TOKEN, PARENT_PAGE_ID },
      });

      py.stdin.write(body);
      py.stdin.end();

      let stdout = '';
      let stderr = '';
      py.stdout.on('data', d => { stdout += d; process.stdout.write(d); });
      py.stderr.on('data', d => { stderr += d; process.stderr.write(d); });

      py.on('close', code => {
        if (code !== 0) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: stderr || 'Portal creation failed' }));
          return;
        }
        const urlMatch = stdout.match(/URL: (https:\/\/\S+)/);
        const url = urlMatch ? urlMatch[1] : '';
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, url }));
      });
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('StayHaus dev server running at http://localhost:' + PORT);
  console.log('Open http://localhost:' + PORT + '/onboarding.html in your browser');
});
