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

test('normalizes direct Claude slash Skill expansions', () => {
  const input = {
    hook_event_name: 'UserPromptExpansion',
    expansion_type: 'slash_command',
    command_name: 'pptx',
    command_args: 'do not edit files',
    command_source: 'personal',
    prompt: '/pptx do not edit files',
    cwd: '/private/project',
    session_id: 'session-slash'
  };
  const result = normalizeHostEvent(input, 'claude-code');

  assert.equal(result.ignored, undefined);
  assert.equal(result.skillName, 'pptx');
  assert.equal(result.sessionId, 'session-slash');
  assert.equal(result.invocationId, null);
  assert.equal(result.outcome, 'started');
  assert.equal(result.metadata.hookEvent, 'UserPromptExpansion');
  assert.equal(result.metadata.commandArgs, undefined);
  assert.equal(result.metadata.prompt, undefined);
  assert.equal(result.metadata.cwd, undefined);
});

test('preserves namespaced slash Skill names and creates a new id per invocation', () => {
  const input = {
    hook_event_name: 'UserPromptExpansion',
    expansion_type: 'slash_command',
    command_name: 'slides:pptx',
    session_id: 'session-slash'
  };
  const first = normalizeHostEvent(input, 'claude-code');
  const second = normalizeHostEvent(input, 'claude-code');

  assert.equal(first.skillName, 'slides:pptx');
  assert.notEqual(first.eventId, second.eventId);
});

test('ignores MCP prompt expansions and ordinary prompts', () => {
  assert.equal(normalizeHostEvent({
    hook_event_name: 'UserPromptExpansion',
    expansion_type: 'mcp_prompt',
    command_name: 'pptx',
    session_id: 'session-mcp'
  }, 'claude-code').ignored, true);

  assert.equal(normalizeHostEvent({
    hook_event_name: 'UserPromptSubmit',
    prompt: '/pptx',
    session_id: 'session-prompt'
  }, 'claude-code').ignored, true);
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
