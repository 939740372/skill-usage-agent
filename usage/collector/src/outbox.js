import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDirectories, failedPath, outboxPath } from './config.js';

function safeEventId(eventId) {
  return String(eventId).replace(/[^a-zA-Z0-9-]/g, '_');
}

export async function enqueue(event) {
  await ensureDirectories();
  const fileName = `${safeEventId(event.eventId)}.json`;
  const target = path.join(outboxPath, fileName);
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(event)}\n`, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    if (error.code !== 'EEXIST') throw error;
    const pending = await readPending(target);
    for (const field of ['skillName', 'agentHost', 'invocationId', 'sessionId', 'eventType']) {
      if (pending[field] != null && event[field] != null && String(pending[field]) !== String(event[field])) {
        throw new Error(`Pending event ${event.eventId} has conflicting ${field}`);
      }
    }
    const merged = {
      ...pending,
      outcome: event.outcome || pending.outcome,
      invokedAt: pending.invokedAt || event.invokedAt,
      metadata: { ...(pending.metadata || {}), ...(event.metadata || {}) }
    };
    await fs.writeFile(temporary, `${JSON.stringify(merged)}\n`, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, target);
  }
  return target;
}

export async function listPending() {
  await ensureDirectories();
  const names = (await fs.readdir(outboxPath)).filter(name => name.endsWith('.json')).sort();
  return names.map(name => path.join(outboxPath, name));
}

export async function readPending(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function removePending(filePath) {
  await fs.rm(filePath, { force: true });
}

export async function moveToFailed(filePath, reason) {
  await ensureDirectories();
  const event = await readPending(filePath);
  const target = path.join(failedPath, `${path.basename(filePath, '.json')}.json`);
  await fs.writeFile(target, `${JSON.stringify({ event, reason, failedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  await removePending(filePath);
}
