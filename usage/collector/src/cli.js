#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { readConfig } from './config.js';
import { createCredentialStore, tokenCredentialKey } from './credentials.js';
import { login, readTokens, decodeJwtPayload } from './oidc.js';
import { record, flush } from './client.js';
import { installHost, setupHost } from './installer.js';
import { updateInstallation } from './update.js';
import { packageVersion } from './version.js';

function option(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : null;
  return value && !value.startsWith('--') ? value : null;
}

function assertSupportedNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) throw new Error(`Node.js 20 or newer is required; found ${process.versions.node}`);
}

function printHelp() {
  console.log(`usage-agent ${packageVersion}

Quick start:
  npm install -g @ryantorres/skill-usage-agent
  usage-agent setup --host claude-code --project-dir .
  usage-agent login

Commands:
  setup       Configure Usage and merge Claude Code hooks
  install     Write a host adapter manifest only
  login       Complete Usage SSO login
  status      Show configuration and authentication status
  logout      Remove Usage SSO credentials
  record      Record one host event from stdin
  hook        Alias for record
  flush       Flush pending outbox events
  update      Update a Git checkout installation
  version     Print the installed package version`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of createInterface({ input: process.stdin })) chunks.push(chunk);
  const content = chunks.join('').trim();
  if (!content) throw new Error('stdin event is empty');
  return JSON.parse(content);
}

async function main() {
  assertSupportedNode();
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(packageVersion);
    return;
  }

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

  if (command === 'setup') {
    const host = option(args, '--host') || 'claude-code';
    const result = await setupHost(host, {
      projectDir: option(args, '--project-dir') || process.cwd(),
      apiBaseUrl: option(args, '--api-base-url'),
      issuer: option(args, '--oidc-issuer'),
      clientId: option(args, '--client-id'),
      scope: option(args, '--scope'),
      redirectUri: option(args, '--redirect-uri'),
      usageAgentBin: option(args, '--bin')
    });
    console.log(JSON.stringify(result, null, 2));
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

  throw new Error('Unknown command. Run `usage-agent help` for available commands.');
}

main().catch(error => {
  console.error(`usage-agent: ${error.message}`);
  process.exitCode = 1;
});
