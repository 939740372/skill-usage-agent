#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { readConfig, writeConfig } from './config.js';
import { createCredentialStore, tokenCredentialKey } from './credentials.js';
import { login, readTokens, decodeJwtPayload } from './oidc.js';
import { record, flush } from './client.js';
import { installHost } from './installer.js';
import { updateInstallation } from './update.js';

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of createInterface({ input: process.stdin })) chunks.push(chunk);
  const content = chunks.join('').trim();
  if (!content) throw new Error('stdin event is empty');
  return JSON.parse(content);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = await readConfig();

  if (command === 'login') {
    const store = await createCredentialStore();
    await login(config, store);
    console.log('Usage SSO login completed.');
    return;
  }

  if (command === 'status') {
    const store = await createCredentialStore();
    const tokens = await readTokens(store);
    const payload = tokens ? decodeJwtPayload(tokens.accessToken) : null;
    console.log(JSON.stringify({
      configured: { apiBaseUrl: config.apiBaseUrl, issuer: config.issuer, clientId: config.clientId },
      authenticated: Boolean(tokens),
      expiresAt: tokens ? new Date(tokens.expiresAt).toISOString() : null,
      subject: payload?.sub || null,
      username: payload?.preferred_username || payload?.username || null
    }, null, 2));
    return;
  }

  if (command === 'logout') {
    const store = await createCredentialStore();
    await store.delete(tokenCredentialKey);
    console.log('Usage SSO credentials removed.');
    return;
  }

  if (command === 'install') {
    const host = option(args, '--host');
    if (!host) throw new Error('--host is required');
    const result = await installHost(host);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'update') {
    console.log(JSON.stringify(await updateInstallation(), null, 2));
    return;
  }

  if (command === 'record' || command === 'hook') {
    const host = option(args, '--host');
    if (!host || !args.includes('--stdin')) throw new Error('usage-agent record --host <host> --stdin');
    const rawEvent = await readStdin();
    const result = await record(rawEvent, host);
    if (result.ignored) return;
    return;
  }

  if (command === 'flush') {
    console.log(JSON.stringify(await flush(), null, 2));
    return;
  }

  throw new Error('Commands: login, status, logout, install, update, record, hook, flush');
}

main().catch(error => {
  console.error(`usage-agent: ${error.message}`);
  process.exitCode = 1;
});
