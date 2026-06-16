#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { URL } from 'node:url';

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
const port = Number(process.env.OAUTH_PORT || 8765);
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
const scope = 'https://www.googleapis.com/auth/gmail.modify';

if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET before running this script.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', scope);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');
authUrl.searchParams.set('state', state);

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', redirectUri);
  if (requestUrl.pathname !== '/oauth2callback') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  if (requestUrl.searchParams.get('state') !== state) {
    response.writeHead(400);
    response.end('Invalid state.');
    return;
  }
  const code = requestUrl.searchParams.get('code');
  if (!code) {
    response.writeHead(400);
    response.end('Missing code.');
    return;
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.refresh_token) {
      throw new Error(JSON.stringify(token, null, 2));
    }
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Gmail authorization complete. You can close this tab and return to the terminal.');
    console.log('\nGMAIL_REFRESH_TOKEN=' + token.refresh_token);
    console.log('\nKeep this token secret. Do not commit it or paste it into chat.');
    server.close();
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('Token exchange failed. See terminal.');
    console.error(error);
    server.close(() => process.exit(1));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Listening on ${redirectUri}`);
  console.log('Opening Google authorization URL...');
  console.log(authUrl.toString());
  try {
    execFileSync('open', [authUrl.toString()]);
  } catch {
    console.log('Open the URL above manually.');
  }
});
