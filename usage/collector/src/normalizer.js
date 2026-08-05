import crypto from 'node:crypto';

export const HOSTS = ['claude-code', 'codex', 'cursor', 'opencode', 'workbuddy', 'trae'];

const SKILL_TOOL_NAMES = new Set(['skill', 'skills', 'skill_tool']);
const TERMINAL_OUTCOMES = new Set(['succeeded', 'failed', 'denied']);

function stableUuid(seed) {
  const bytes = crypto.createHash('sha256').update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '');
}

function toolInput(raw) {
  return raw.tool_input || raw.toolInput || raw.input || {};
}

function hookEventName(raw) {
  return firstValue(raw.hook_event_name, raw.hookEvent, raw.event);
}

function expansionType(raw) {
  return firstValue(raw.expansion_type, raw.expansionType);
}

function commandName(raw) {
  return firstValue(raw.command_name, raw.commandName);
}

function isDirectSlashExpansion(raw) {
  return String(hookEventName(raw) || '').toLowerCase() === 'userpromptexpansion'
    && String(expansionType(raw) || '').toLowerCase() === 'slash_command'
    && commandName(raw) != null;
}

function pickSkillName(raw) {
  const input = toolInput(raw);
  const skill = raw.skill || raw.skillName || raw.skill_name || input.skill || input.skillName || input.name
    || (isDirectSlashExpansion(raw) ? commandName(raw) : null);
  if (typeof skill === 'object' && skill !== null) {
    return firstValue(skill.name, skill.skillName);
  }
  return skill;
}

function looksLikeSkillEvent(raw) {
  if (String(hookEventName(raw) || '').toLowerCase() === 'userpromptexpansion') {
    return isDirectSlashExpansion(raw);
  }
  if (raw.eventType === 'skill_invocation' || raw.skillName || raw.skill_name) return true;
  const toolName = String(firstValue(raw.tool_name, raw.toolName, raw.tool) || '').toLowerCase();
  return SKILL_TOOL_NAMES.has(toolName);
}

function canonicalSkillName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(name)) return null;
  return name;
}

function outcomeFor(raw) {
  const explicit = String(raw.outcome || raw.status || '').toLowerCase();
  if (TERMINAL_OUTCOMES.has(explicit)) return explicit;
  const hookEvent = String(hookEventName(raw) || '').toLowerCase();
  if (hookEvent.includes('denied') || hookEvent.includes('permission')) return 'denied';
  if (hookEvent.includes('failure') || hookEvent.includes('error')) return 'failed';
  if (hookEvent.includes('post') || hookEvent.includes('complete') || hookEvent.includes('success')) return 'succeeded';
  return 'started';
}

export function normalizeHostEvent(raw, host) {
  if (!raw || typeof raw !== 'object') return { ignored: true, reason: 'event is not an object' };
  if (!HOSTS.includes(host)) return { ignored: true, reason: `unsupported host: ${host}` };
  if (host === 'trae') return { ignored: true, reason: 'TRAE Skill Hook is not enabled until runtime validation passes' };
  if (!looksLikeSkillEvent(raw)) return { ignored: true, reason: 'not a Skill event' };

  const skillName = canonicalSkillName(pickSkillName(raw));
  if (!skillName) return { ignored: true, reason: 'Skill name is missing or is not canonical' };

  const sessionId = firstValue(raw.session_id, raw.sessionId, raw.session, raw.context?.session_id);
  const invocationId = firstValue(
    raw.invocation_id,
    raw.invocationId,
    raw.tool_use_id,
    raw.toolUseId,
    raw.tool_call_id,
    raw.toolCallId,
    raw.id,
    toolInput(raw).invocationId);
  const normalizedInvocationId = invocationId == null ? null : String(invocationId).slice(0, 255);
  const normalizedSessionId = sessionId == null ? null : String(sessionId).slice(0, 255);
  const eventSeed = normalizedInvocationId
    ? `${host}|${normalizedSessionId || ''}|${normalizedInvocationId}|${skillName}`
    : `${host}|${normalizedSessionId || ''}|${skillName}|${crypto.randomUUID()}`;
  const eventId = raw.eventId || stableUuid(eventSeed);
  const rawHookEvent = hookEventName(raw);

  return {
    eventId,
    schemaVersion: 1,
    skillName,
    skillVersion: raw.skillVersion || raw.skill_version || null,
    agentHost: host,
    collectorType: host === 'opencode' ? 'plugin' : 'hook',
    invocationId: normalizedInvocationId,
    sessionId: normalizedSessionId,
    eventType: 'skill_invocation',
    outcome: outcomeFor(raw),
    invokedAt: raw.invokedAt || raw.invoked_at || new Date().toISOString(),
    metadata: {
      ...(raw.hostVersion || raw.host_version ? { hostVersion: String(raw.hostVersion || raw.host_version).slice(0, 256) } : {}),
      ...(rawHookEvent ? { hookEvent: String(rawHookEvent).slice(0, 256) } : {}),
      collectorVersion: '0.1.0'
    }
  };
}

export { canonicalSkillName, stableUuid };
