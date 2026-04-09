import fs from 'fs';

export function loadLedger(path) {
  if (!fs.existsSync(path)) return [];
  const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
  return data.processedIds || [];
}

export function saveLedger(path, entries) {
  fs.writeFileSync(path, JSON.stringify({ processedIds: entries }, null, 2));
}

export function isProcessed(ledger, messageId) {
  return ledger.some(entry => entry.id === messageId);
}

export function markProcessed(ledger, messageId, date) {
  ledger.push({ id: messageId, date: date || new Date().toISOString().slice(0, 10) });
  return ledger;
}

export function pruneOldEntries(ledger, now) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 90);
  return ledger.filter(entry => new Date(entry.date) >= cutoff);
}
