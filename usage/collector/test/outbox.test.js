import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('outbox files contain event data only and use restrictive permissions', async () => {
  const temporaryHome = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-usage-test-'));
  const previousHome = process.env.SKILL_USAGE_HOME;
  process.env.SKILL_USAGE_HOME = temporaryHome;
  const config = await import(`../src/config.js?test=${Date.now()}`);
  const outbox = await import(`../src/outbox.js?test=${Date.now()}`);
  const filePath = await outbox.enqueue({ eventId: '11111111-1111-4111-8111-111111111111', skillName: 'demo' });
  const samePath = await outbox.enqueue({ eventId: '11111111-1111-4111-8111-111111111111', skillName: 'demo' });
  assert.equal(samePath, filePath);
  const stat = await fs.stat(filePath);
  assert.equal(stat.mode & 0o077, 0);
  assert.deepEqual(await outbox.readPending(filePath), {
    eventId: '11111111-1111-4111-8111-111111111111',
    skillName: 'demo'
  });
  await fs.rm(temporaryHome, { recursive: true, force: true });
  if (previousHome === undefined) delete process.env.SKILL_USAGE_HOME;
  else process.env.SKILL_USAGE_HOME = previousHome;
  void config;
});

test('same pending event is merged to its terminal outcome', async () => {
  const temporaryHome = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-usage-test-'));
  const previousHome = process.env.SKILL_USAGE_HOME;
  process.env.SKILL_USAGE_HOME = temporaryHome;
  const outbox = await import(`../src/outbox.js?merge=${Date.now()}`);
  const eventId = '22222222-2222-4222-8222-222222222222';
  const filePath = await outbox.enqueue({
    eventId,
    skillName: 'demo',
    agentHost: 'claude-code',
    eventType: 'skill_invocation',
    outcome: 'started',
    metadata: { hookEvent: 'PreToolUse' }
  });
  await outbox.enqueue({
    eventId,
    skillName: 'demo',
    agentHost: 'claude-code',
    eventType: 'skill_invocation',
    outcome: 'succeeded',
    metadata: { hookEvent: 'PostToolUse' }
  });
  assert.deepEqual(await outbox.readPending(filePath), {
    eventId,
    skillName: 'demo',
    agentHost: 'claude-code',
    eventType: 'skill_invocation',
    outcome: 'succeeded',
    metadata: { hookEvent: 'PostToolUse' }
  });
  await fs.rm(temporaryHome, { recursive: true, force: true });
  if (previousHome === undefined) delete process.env.SKILL_USAGE_HOME;
  else process.env.SKILL_USAGE_HOME = previousHome;
});
