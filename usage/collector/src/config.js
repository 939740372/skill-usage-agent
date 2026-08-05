import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { packageVersion } from './version.js';

export const usageHome = process.env.SKILL_USAGE_HOME || path.join(os.homedir(), '.skill-usage');
export const configPath = path.join(usageHome, 'config.json');
export const outboxPath = path.join(usageHome, 'outbox');
export const failedPath = path.join(usageHome, 'failed');
export const adaptersPath = path.join(usageHome, 'adapters');

const defaults = {
  apiBaseUrl: process.env.USAGE_API_BASE_URL || 'http://localhost:8080',
  issuer: process.env.USAGE_OIDC_ISSUER || 'http://10.130.79.3:8080/realms/test',
  clientId: process.env.USAGE_OIDC_CLIENT_ID || 'skill-usage',
  scope: process.env.USAGE_OIDC_SCOPE || 'openid profile email',
  redirectUri: process.env.USAGE_OIDC_REDIRECT_URI || 'http://127.0.0.1:8765/callback',
  requestTimeoutMs: Number(process.env.USAGE_REQUEST_TIMEOUT_MS || 800),
  collectorVersion: packageVersion
};

export async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(usageHome, { recursive: true, mode: 0o700 }),
    fs.mkdir(outboxPath, { recursive: true, mode: 0o700 }),
    fs.mkdir(failedPath, { recursive: true, mode: 0o700 }),
    fs.mkdir(adaptersPath, { recursive: true, mode: 0o700 })
  ]);
}

export async function readConfig() {
  await ensureDirectories();
  try {
    const content = await fs.readFile(configPath, 'utf8');
    return { ...defaults, ...JSON.parse(content) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { ...defaults };
  }
}

export async function writeConfig(values) {
  await ensureDirectories();
  const content = `${JSON.stringify({ ...defaults, ...values }, null, 2)}\n`;
  await fs.writeFile(configPath, content, { mode: 0o600 });
  await fs.chmod(configPath, 0o600);
}
