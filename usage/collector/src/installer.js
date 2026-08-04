import fs from 'node:fs/promises';
import path from 'node:path';
import { adaptersPath, ensureDirectories } from './config.js';
import { HOSTS } from './normalizer.js';

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
