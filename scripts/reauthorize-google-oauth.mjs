#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { URL } from 'node:url';

const projectId = process.env.PROJECT_ID || 'kyc-agent-staging-20260610';
const secretName = process.env.GMAIL_REFRESH_TOKEN_SECRET || 'gmail-refresh-token';
const port = Number(process.env.OAUTH_PORT || 8765);
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
const scopes = (process.env.OAUTH_SCOPES || [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive',
].join(' ')).trim();

function gcloud(args, input) {
  const result = spawnSync('/Users/openclawbot/google-cloud-sdk/bin/gcloud', args, {
    input,
    encoding: 'utf8',
    stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `gcloud ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function secret(secret) {
  return gcloud(['secrets', 'versions', 'access', 'latest', '--secret', secret, '--project', projectId]);
}

function storeRefreshToken(token) {
  gcloud(['secrets', 'versions', 'add', secretName, '--project', projectId, '--data-file=-'], token);
}

const clientId = process.env.GMAIL_CLIENT_ID || secret('gmail-client-id');
const clientSecret = process.env.GMAIL_CLIENT_SECRET || secret('gmail-client-secret');

if (!clientId || !clientSecret) {
  console.error('Missing Gmail OAuth client id/secret.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', scopes);
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
      throw new Error(JSON.stringify({
        error: token.error,
        error_description: token.error_description,
        has_refresh_token: Boolean(token.refresh_token),
      }));
    }
    storeRefreshToken(token.refresh_token);
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Google Gmail/Drive authorization complete. You can close this tab.');
    console.log(`Stored a new ${secretName} version in Secret Manager for ${projectId}.`);
    server.close();
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('Token exchange failed. See terminal.');
    console.error(error instanceof Error ? error.message : error);
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
