import fs from 'node:fs/promises';
import path from 'node:path';
import { adaptersPath, configPath, ensureDirectories, readConfig, writeConfig } from './config.js';
import { HOSTS } from './normalizer.js';

const CLAUDE_HOOKS = [
  { event: 'PreToolUse', matcher: 'Skill' },
  { event: 'PostToolUse', matcher: 'Skill' },
  { event: 'PostToolUseFailure', matcher: 'Skill' },
  { event: 'UserPromptExpansion', matcher: '' }
];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isClaudeRecordCommand(command) {
  return typeof command === 'string'
    && /(?:^|\s)record\s+--host\s+claude-code\s+--stdin(?:\s|$)/.test(command);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function hasClaudeHook(entries, matcher) {
  return entries.some(entry => entry?.matcher === matcher
    && Array.isArray(entry.hooks)
    && entry.hooks.some(hook => hook?.type === 'command' && isClaudeRecordCommand(hook.command)));
}

export function mergeClaudeCodeSettings(existing, { command = 'usage-agent', env = {}, overwriteEnvKeys = new Set() } = {}) {
  const settings = { ...existing };
  const existingEnv = isRecord(existing.env) ? existing.env : {};
  settings.env = { ...existingEnv };
  for (const [key, value] of Object.entries(env)) {
    if (value == null || value === '') continue;
    if (settings.env[key] == null || settings.env[key] === '' || overwriteEnvKeys.has(key)) {
      settings.env[key] = String(value);
    }
  }

  const existingHooks = isRecord(existing.hooks) ? existing.hooks : {};
  settings.hooks = { ...existingHooks };
  const addedHooks = [];
  for (const { event, matcher } of CLAUDE_HOOKS) {
    const entries = Array.isArray(existingHooks[event]) ? [...existingHooks[event]] : [];
    if (!hasClaudeHook(entries, matcher)) {
      entries.push({
        matcher,
        hooks: [{ type: 'command', command: `${shellQuote(command)} record --host claude-code --stdin`, timeout: 3 }]
      });
      addedHooks.push(event);
    }
    settings.hooks[event] = entries;
  }

  return { settings, addedHooks };
}

async function readClaudeSettings(settingsPath) {
  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    const settings = JSON.parse(content);
    if (!isRecord(settings)) throw new Error('Claude settings must contain a JSON object');
    if (settings.env !== undefined && !isRecord(settings.env)) throw new Error('Claude settings env must be a JSON object');
    if (settings.hooks !== undefined && !isRecord(settings.hooks)) throw new Error('Claude settings hooks must be a JSON object');
    return settings;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) throw new Error(`Claude settings JSON is invalid: ${settingsPath}`, { cause: error });
    throw error;
  }
}

export async function installHost(host) {
  if (!HOSTS.includes(host)) throw new Error(`Unsupported host: ${host}`);
  await ensureDirectories();
  const status = host === 'trae' ? 'pending-runtime-probe' : 'ready-for-host-config';
  const manifest = {
    host,
    status,
    command: `usage-agent record --host ${host} --stdin`,
    eventType: 'skill_invocation',
    failOpen: true,
    note: host === 'trae'
      ? 'TRAE remains disabled until a stable Skill Hook/Plugin event is verified.'
      : 'Connect the command to the host Hook/Plugin event that confirms a Skill invocation.'
  };
  const target = path.join(adaptersPath, `${host}.json`);
  await fs.writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return { target, manifest };
}

export async function setupClaudeCode(options = {}) {
  const projectDir = path.resolve(options.projectDir || process.cwd());
  const projectStat = await fs.stat(projectDir).catch(() => null);
  if (!projectStat?.isDirectory()) throw new Error(`Claude project directory does not exist: ${projectDir}`);

  const settingsPath = path.join(projectDir, '.claude', 'settings.local.json');
  const existingSettings = await readClaudeSettings(settingsPath);
  const existingEnv = isRecord(existingSettings.env) ? existingSettings.env : {};
  const currentConfig = await readConfig();
  const configValues = {
    apiBaseUrl: options.apiBaseUrl || existingEnv.USAGE_API_BASE_URL || currentConfig.apiBaseUrl,
    issuer: options.issuer || existingEnv.USAGE_OIDC_ISSUER || currentConfig.issuer,
    clientId: options.clientId || existingEnv.USAGE_OIDC_CLIENT_ID || currentConfig.clientId,
    scope: options.scope || existingEnv.USAGE_OIDC_SCOPE || currentConfig.scope,
    redirectUri: options.redirectUri || existingEnv.USAGE_OIDC_REDIRECT_URI || currentConfig.redirectUri
  };
  await writeConfig(configValues);

  const env = {
    USAGE_API_BASE_URL: configValues.apiBaseUrl,
    USAGE_OIDC_ISSUER: configValues.issuer,
    USAGE_OIDC_CLIENT_ID: configValues.clientId,
    USAGE_OIDC_SCOPE: configValues.scope,
    USAGE_OIDC_REDIRECT_URI: configValues.redirectUri
  };
  const overwriteEnvKeys = new Set([
    ...(options.apiBaseUrl ? ['USAGE_API_BASE_URL'] : []),
    ...(options.issuer ? ['USAGE_OIDC_ISSUER'] : []),
    ...(options.clientId ? ['USAGE_OIDC_CLIENT_ID'] : []),
    ...(options.scope ? ['USAGE_OIDC_SCOPE'] : []),
    ...(options.redirectUri ? ['USAGE_OIDC_REDIRECT_URI'] : [])
  ]);
  const command = options.usageAgentBin || process.env.USAGE_AGENT_BIN || 'usage-agent';
  const merged = mergeClaudeCodeSettings(existingSettings, { command, env, overwriteEnvKeys });

  await fs.mkdir(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(settingsPath, `${JSON.stringify(merged.settings, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(settingsPath, 0o600);

  const adapter = await installHost('claude-code');
  return {
    host: 'claude-code',
    settingsPath,
    configPath,
    adapterManifestPath: adapter.target,
    command,
    addedHooks: merged.addedHooks
  };
}

export async function setupHost(host, options = {}) {
  if (host === 'claude-code') return setupClaudeCode(options);
  return installHost(host);
}
