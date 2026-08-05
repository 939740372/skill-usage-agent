import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeClaudeCodeSettings } from '../src/installer.js';

test('merges Claude hooks and environment without deleting existing settings', () => {
  const existing = {
    customSetting: true,
    env: { USAGE_API_BASE_URL: 'http://existing.example', KEEP_ME: 'yes' },
    hooks: {
      PreToolUse: [{
        matcher: 'Skill',
        hooks: [{ type: 'command', command: '/opt/usage-agent record --host claude-code --stdin', timeout: 3 }]
      }],
      UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'echo keep' }] }]
    }
  };

  const first = mergeClaudeCodeSettings(existing, {
    command: '/usr/local/bin/usage-agent',
    env: {
      USAGE_API_BASE_URL: 'http://new.example',
      USAGE_OIDC_ISSUER: 'http://issuer.example'
    }
  });

  assert.equal(first.settings.customSetting, true);
  assert.equal(first.settings.env.USAGE_API_BASE_URL, 'http://existing.example');
  assert.equal(first.settings.env.USAGE_OIDC_ISSUER, 'http://issuer.example');
  assert.equal(first.settings.env.KEEP_ME, 'yes');
  assert.equal(first.settings.hooks.UserPromptSubmit[0].hooks[0].command, 'echo keep');
  assert.equal(first.settings.hooks.PreToolUse.length, 1);
  assert.equal(first.settings.hooks.UserPromptExpansion[0].matcher, '');
  assert.match(first.settings.hooks.UserPromptExpansion[0].hooks[0].command, /record --host claude-code --stdin$/);
  assert.equal(first.addedHooks.includes('PreToolUse'), false);

  const second = mergeClaudeCodeSettings(first.settings, {
    command: '/usr/local/bin/usage-agent',
    env: { USAGE_OIDC_ISSUER: 'http://issuer.example' }
  });
  assert.deepEqual(second.addedHooks, []);
  assert.equal(second.settings.hooks.UserPromptExpansion.length, 1);
});

test('explicit setup values can replace matching existing environment values', () => {
  const result = mergeClaudeCodeSettings({ env: { USAGE_OIDC_CLIENT_ID: 'old-client' } }, {
    env: { USAGE_OIDC_CLIENT_ID: 'new-client' },
    overwriteEnvKeys: new Set(['USAGE_OIDC_CLIENT_ID'])
  });

  assert.equal(result.settings.env.USAGE_OIDC_CLIENT_ID, 'new-client');
});
