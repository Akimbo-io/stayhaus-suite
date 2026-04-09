import fs from 'fs';

export function writeStatus(path, status) {
  fs.writeFileSync(path, JSON.stringify({
    ...status,
    timestamp: new Date().toISOString(),
  }, null, 2));
}
