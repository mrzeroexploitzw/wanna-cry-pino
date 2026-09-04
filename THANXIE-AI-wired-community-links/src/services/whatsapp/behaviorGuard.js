import crypto from 'node:crypto';

const GLOBAL_LIMIT = Number(process.env.WA_GLOBAL_MESSAGES_PER_MINUTE || 30);
const GROUP_LIMIT = Number(process.env.WA_GROUP_MESSAGES_PER_MINUTE || 10);
const USER_LIMIT = Number(process.env.WA_USER_MESSAGES_PER_MINUTE || 6);
const MIN_DELAY_MS = Number(process.env.WA_MIN_SEND_DELAY_MS || 1800);
const DUPLICATE_WINDOW_MS = Number(process.env.WA_DUPLICATE_WINDOW_MS || 120000);
const MAX_QUEUE = Number(process.env.WA_MAX_QUEUE || 100);

const state = {
  global: [],
  groups: new Map(),
  users: new Map(),
  recent: new Map(),
  lastSentAt: 0,
  queueDepth: 0,
  circuitOpenUntil: 0,
};

function prune(list, windowMs = 60_000) {
  const cutoff = Date.now() - windowMs;
  while (list.length && list[0] < cutoff) list.shift();
  return list;
}

function bucket(map, key) {
  if (!map.has(key)) map.set(key, []);
  return map.get(key);
}

export function behaviorSnapshot() {
  return {
    globalLastMinute: prune(state.global).length,
    queueDepth: state.queueDepth,
    circuitOpen: state.circuitOpenUntil > Date.now(),
  };
}

export function recordTransportFailure(error) {
  const code = Number(error?.output?.statusCode || error?.statusCode || 0);
  if ([401, 403, 405, 406, 409, 429].includes(code)) {
    state.circuitOpenUntil = Date.now() + Number(process.env.WA_CIRCUIT_BREAK_MS || 60_000);
  }
}

export function authorizeOutbound({ jid, groupId = null, sender = null, text = '', kind = 'text' }) {
  const now = Date.now();
  if (state.circuitOpenUntil > now) return { allowed: false, reason: 'CIRCUIT_BREAKER' };
  if (state.queueDepth >= MAX_QUEUE) return { allowed: false, reason: 'QUEUE_FULL' };

  prune(state.global);
  if (state.global.length >= GLOBAL_LIMIT) return { allowed: false, reason: 'GLOBAL_RATE_LIMIT' };

  const groupKey = groupId || (String(jid || '').endsWith('@g.us') ? jid : null);
  if (groupKey) {
    const list = prune(bucket(state.groups, groupKey));
    if (list.length >= GROUP_LIMIT) return { allowed: false, reason: 'GROUP_RATE_LIMIT' };
  }

  if (sender) {
    const list = prune(bucket(state.users, sender));
    if (list.length >= USER_LIMIT) return { allowed: false, reason: 'USER_RATE_LIMIT' };
  }

  const fingerprint = crypto.createHash('sha256').update(`${jid}|${kind}|${String(text).trim()}`).digest('hex');
  const previous = state.recent.get(fingerprint) || 0;
  if (previous > now - DUPLICATE_WINDOW_MS) return { allowed: false, reason: 'DUPLICATE_SUPPRESSED' };

  const waitMs = Math.max(0, MIN_DELAY_MS - (now - state.lastSentAt));
  return { allowed: true, waitMs, fingerprint, groupKey };
}

export function markOutbound({ sender = null, groupKey = null, fingerprint }) {
  const now = Date.now();
  state.global.push(now);
  if (groupKey) bucket(state.groups, groupKey).push(now);
  if (sender) bucket(state.users, sender).push(now);
  if (fingerprint) state.recent.set(fingerprint, now);
  state.lastSentAt = now;
  state.queueDepth = Math.max(0, state.queueDepth - 1);
}

export function reserveQueue() {
  if (state.queueDepth >= MAX_QUEUE) return false;
  state.queueDepth += 1;
  return true;
}

export function releaseQueue() {
  state.queueDepth = Math.max(0, state.queueDepth - 1);
}

export function getSendPolicy() {
  return { GLOBAL_LIMIT, GROUP_LIMIT, USER_LIMIT, MIN_DELAY_MS, DUPLICATE_WINDOW_MS, MAX_QUEUE };
}
