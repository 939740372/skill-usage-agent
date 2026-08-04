import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { URL, URLSearchParams } from 'node:url';

function base64Url(buffer) {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function randomUrlValue(size = 32) {
  return base64Url(crypto.randomBytes(size));
}

function pkceChallenge(verifier) {
  return base64Url(crypto.createHash('sha256').update(verifier).digest());
}

async function discover(issuer) {
  const normalized = issuer.replace(/\/$/, '');
  const response = await fetch(`${normalized}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
  return response.json();
}

function openBrowser(url) {
  if (process.env.USAGE_NO_BROWSER === '1') {
    console.log(`Open this URL to authenticate:\n${url}`);
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function waitForCallback(redirectUri, expectedState) {
  const callback = new URL(redirectUri);
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url, `${callback.protocol}//${callback.host}`);
      if (requestUrl.pathname !== callback.pathname) {
        response.writeHead(404);
        response.end();
        return;
      }
      if (requestUrl.searchParams.get('state') !== expectedState) {
        response.writeHead(400);
        response.end('Invalid state');
        server.close();
        reject(new Error('OIDC callback state mismatch'));
        return;
      }
      const error = requestUrl.searchParams.get('error');
      if (error) {
        response.writeHead(400);
        response.end('Authentication failed');
        server.close();
        reject(new Error(`OIDC authentication failed: ${error}`));
        return;
      }
      const code = requestUrl.searchParams.get('code');
      if (!code) {
        response.writeHead(400);
        response.end('Missing code');
        server.close();
        reject(new Error('OIDC callback did not contain an authorization code'));
        return;
      }
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Usage SSO login completed. You may close this window.');
      server.close();
      resolve(code);
    });
    server.on('error', reject);
    server.listen(Number(callback.port), callback.hostname);
  });
}

async function exchangeCode(discovery, config, code, verifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    code_verifier: verifier,
    redirect_uri: config.redirectUri
  });
  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new Error(`OIDC token exchange failed with HTTP ${response.status}`);
  return response.json();
}

function expiresAt(tokenResponse) {
  const expiresIn = Number(tokenResponse.expires_in || 300);
  return Date.now() + expiresIn * 1000;
}

export async function login(config, credentialStore) {
  const discovery = await discover(config.issuer);
  const state = randomUrlValue();
  const verifier = randomUrlValue(48);
  const authorizationUrl = new URL(discovery.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256'
  }).toString();

  const callbackPromise = waitForCallback(config.redirectUri, state);
  openBrowser(authorizationUrl.toString());
  const code = await callbackPromise;
  const tokenResponse = await exchangeCode(discovery, config, code, verifier);
  const tokens = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    tokenType: tokenResponse.token_type || 'Bearer',
    expiresAt: expiresAt(tokenResponse)
  };
  await credentialStore.set('oidc-tokens', JSON.stringify(tokens));
  return tokens;
}

async function refresh(config, credentialStore, tokens) {
  if (!tokens?.refreshToken) throw new Error('No refresh token is available; run usage-agent login');
  const discovery = await discover(config.issuer);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: tokens.refreshToken
  });
  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new Error(`OIDC token refresh failed with HTTP ${response.status}`);
  const tokenResponse = await response.json();
  const refreshed = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token || tokens.refreshToken,
    tokenType: tokenResponse.token_type || tokens.tokenType || 'Bearer',
    expiresAt: expiresAt(tokenResponse)
  };
  await credentialStore.set('oidc-tokens', JSON.stringify(refreshed));
  return refreshed;
}

export async function readTokens(credentialStore) {
  const content = await credentialStore.get('oidc-tokens');
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    await credentialStore.delete('oidc-tokens');
    return null;
  }
}

export async function validAccessToken(config, credentialStore) {
  const tokens = await readTokens(credentialStore);
  if (!tokens) throw new Error('Not logged in; run usage-agent login');
  if (tokens.accessToken && Number(tokens.expiresAt || 0) > Date.now() + 60_000) {
    return tokens.accessToken;
  }
  const refreshed = await refresh(config, credentialStore, tokens);
  return refreshed.accessToken;
}

export function decodeJwtPayload(token) {
  if (!token || token.split('.').length !== 3) return null;
  try {
    const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}
