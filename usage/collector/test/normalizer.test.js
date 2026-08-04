import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHostEvent } from '../src/normalizer.js';

test('normalizes Claude-compatible Skill hook and keeps a stable event id', () => {
  const input = {
    hook_event_name: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'superpowers:brainstorming' },
    tool_use_id: 'tool-1',
    session_id: 'session-1',
    host_version: '2.1.220'
  };
  const first = normalizeHostEvent(input, 'claude-code');
  const second = normalizeHostEvent(input, 'claude-code');
  assert.equal(first.ignored, undefined);
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.skillName, 'superpowers:brainstorming');
  assert.equal(first.outcome, 'started');
  assert.equal(first.metadata.hostVersion, '2.1.220');
});

test('ignores non-Skill tools and unsafe paths', () => {
  assert.equal(normalizeHostEvent({ tool_name: 'Bash', tool_input: { command: 'pwd' } }, 'cursor').ignored, true);
  assert.equal(normalizeHostEvent({ tool_name: 'Skill', tool_input: { skill: '/private/project/SKILL.md' } }, 'codex').ignored, true);
});

test('does not pretend TRAE has reliable hooks', () => {
  const result = normalizeHostEvent({ skillName: 'demo' }, 'trae');
  assert.equal(result.ignored, true);
  assert.match(result.reason, /TRAE/);
});

test('maps terminal hook events to outcomes', () => {
  const result = normalizeHostEvent({
    event: 'PostToolUseFailure',
    tool_name: 'skill',
    tool_input: { name: 'openspec-proposal' },
    invocation_id: 'i-1'
  }, 'opencode');
  assert.equal(result.outcome, 'failed');
  assert.equal(result.collectorType, 'plugin');
});
