import { google } from 'googleapis';
import fs from 'fs';
import http from 'http';
import { parse as parseUrl } from 'url';
import { exec } from 'child_process';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export function createAuthClient(credentials) {
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

export function loadToken(tokenPath) {
  if (!fs.existsSync(tokenPath)) return null;
  const raw = fs.readFileSync(tokenPath, 'utf-8');
  return JSON.parse(raw);
}

export function saveToken(tokenPath, token) {
  fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));
}

export async function authenticate(credentialsPath, tokenPath) {
  const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
  const client = createAuthClient(creds);

  const existingToken = loadToken(tokenPath);
  if (existingToken) {
    client.setCredentials(existingToken);
    client.on('tokens', (newTokens) => {
      const merged = { ...existingToken, ...newTokens };
      saveToken(tokenPath, merged);
    });
    return client;
  }

  // First-run: open browser for consent
  const FIXED_PORT = 8080;
  const redirectUri = `http://localhost:${FIXED_PORT}`;

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const query = parseUrl(req.url, true).query;
      if (query.code) {
        res.end('Authentication successful. You can close this tab.');
        server.close();
        resolve(query.code);
      } else {
        res.end('No code found.');
      }
    });
    server.listen(FIXED_PORT, () => {
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        redirect_uri: redirectUri,
      });
      console.log('\nOpening browser for authentication...\n');
      console.log(authUrl);
      console.log(`\nWaiting for auth callback on ${redirectUri}...`);
      exec(`open "${authUrl}"`);
    });
    setTimeout(() => { server.close(); reject(new Error('Auth timeout after 2 minutes')); }, 120000);
  });

  const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
  client.setCredentials(tokens);
  saveToken(tokenPath, tokens);
  return client;
}
