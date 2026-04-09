import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from './auth.js';
import { fetchEmailsFromSender, extractHtmlBody, extractInlineImages, getAttachment } from './gmail.js';
import { parseEmailHtml } from './parser.js';
import { downloadAndEncodeImage } from './images.js';
import { loadLedger, saveLedger, isProcessed, markProcessed, pruneOldEntries } from './ledger.js';
import { writeStatus } from './status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const CREDENTIALS_PATH = path.join(ROOT, 'credentials.json');
const TOKEN_PATH = path.join(ROOT, 'token.json');
const STATUS_PATH = path.join(ROOT, 'last-run-status.json');

async function processImages(elements, cidMap) {
  for (const el of elements) {
    if (el.type === 'image' && el.src) {
      const result = await downloadAndEncodeImage(el.src, cidMap);
      if (result) {
        el.base64 = result.base64;
        const displayWidth = el.width ?? 600;
        el.width = displayWidth;
        el.height = result.height
          ? Math.round(result.height * (displayWidth / result.width))
          : result.height;
      } else {
        el.type = 'section';
        el.direction = 'vertical';
        el.backgroundColor = '#f0f0f0';
        el.children = [{
          type: 'text',
          content: `[Image: ${el.altText || el.src}]`,
          fontSize: 12,
          color: '#999999',
          align: 'center',
        }];
      }
      delete el.src;
    }
    if (el.children) {
      await processImages(el.children, cidMap);
    }
  }
}

async function run() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const outputDir = path.resolve(ROOT, config.outputDir);
  const ledgerPath = path.resolve(ROOT, config.processedLedger);

  fs.mkdirSync(outputDir, { recursive: true });

  let auth;
  try {
    auth = await authenticate(CREDENTIALS_PATH, TOKEN_PATH);
  } catch (err) {
    writeStatus(STATUS_PATH, { status: 'error', message: `Auth failed: ${err.message}` });
    console.error('Authentication failed:', err.message);
    process.exit(1);
  }

  let ledger = loadLedger(ledgerPath);
  ledger = pruneOldEntries(ledger, new Date());

  const stats = { found: 0, parsed: 0, failed: 0, skipped: 0 };

  for (const sender of config.senders) {
    console.log(`Fetching emails from ${sender}...`);
    let messages;
    try {
      messages = await fetchEmailsFromSender(auth, sender);
    } catch (err) {
      console.error(`Failed to fetch from ${sender}:`, err.message);
      stats.failed++;
      continue;
    }

    stats.found += messages.length;

    for (const msg of messages) {
      if (isProcessed(ledger, msg.id)) {
        stats.skipped++;
        continue;
      }

      try {
        const html = extractHtmlBody(msg.payload);
        if (!html) {
          console.log(`No HTML body for message ${msg.id}, skipping`);
          stats.skipped++;
          continue;
        }

        const parsed = parseEmailHtml(html);

        const headers = msg.payload.headers || [];
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
        const date = headers.find(h => h.name.toLowerCase() === 'date')?.value;
        const dateStr = date ? new Date(date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

        const inlineImages = extractInlineImages(msg.payload);
        const cidMap = {};
        for (const img of inlineImages) {
          if (img.contentId && img.attachmentId) {
            const attachData = await getAttachment(auth, msg.id, img.attachmentId);
            cidMap[img.contentId] = attachData;
          }
        }

        await processImages(parsed.elements, cidMap);

        const output = {
          meta: { sender, subject, date: dateStr, messageId: msg.id },
          ...parsed,
        };

        const hash = msg.id.slice(0, 6);
        const safeSender = sender.replace(/[@.]/g, '-');
        const safeSubject = subject.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50).toLowerCase();
        const filename = `${dateStr}-${safeSender}-${safeSubject}-${hash}.json`;
        const outputPath = path.join(outputDir, filename);
        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

        console.log(`Parsed: ${filename}`);
        ledger = markProcessed(ledger, msg.id, dateStr);
        stats.parsed++;
      } catch (err) {
        console.error(`Failed to parse message ${msg.id}:`, err.message);
        stats.failed++;
      }
    }
  }

  saveLedger(ledgerPath, ledger);
  writeStatus(STATUS_PATH, { status: 'ok', ...stats });
  console.log(`Done. Found: ${stats.found}, Parsed: ${stats.parsed}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  writeStatus(STATUS_PATH, { status: 'error', message: err.message });
  process.exit(1);
});
