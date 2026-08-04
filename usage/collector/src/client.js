import { readConfig } from './config.js';
import { createCredentialStore } from './credentials.js';
import { validAccessToken } from './oidc.js';
import { enqueue, listPending, moveToFailed, readPending, removePending } from './outbox.js';
import { normalizeHostEvent } from './normalizer.js';

class HttpError extends Error {
  constructor(status) {
    super(`Usage API returned HTTP ${status}`);
    this.status = status;
  }
}

async function postEvent(config, credentialStore, event) {
  const accessToken = await validAccessToken(config, credentialStore);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}/api/v1/skill-events`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(event),
      signal: controller.signal
    });
    if (!response.ok) throw new HttpError(response.status);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function record(rawEvent, host, dependencies = {}) {
  const event = normalizeHostEvent(rawEvent, host);
  if (event.ignored) return event;
  try {
    const config = dependencies.config || await readConfig();
    const credentialStore = dependencies.credentialStore || await createCredentialStore();
    await postEvent(config, credentialStore, event);
  } catch {
    try {
      await enqueue(event);
      await flush({ ...dependencies, maxEvents: 1 });
    } catch {
      // Fail-open: network or local outbox errors must not block the host agent.
    }
  }
  return { ignored: false, event };
}

export async function flush(dependencies = {}) {
  const config = dependencies.config || await readConfig();
  const credentialStore = dependencies.credentialStore || await createCredentialStore();
  const files = await listPending();
  let sent = 0;
  let failed = 0;
  let movedToFailed = 0;
  for (const filePath of files.slice(0, dependencies.maxEvents || 100)) {
    const event = await readPending(filePath);
    try {
      await postEvent(config, credentialStore, event);
      await removePending(filePath);
      sent += 1;
    } catch (error) {
      failed += 1;
      if (error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429) {
        await moveToFailed(filePath, `HTTP ${error.status}`);
        movedToFailed += 1;
      }
    }
  }
  return { pending: files.length - sent - movedToFailed, sent, failed };
}

export { HttpError };
