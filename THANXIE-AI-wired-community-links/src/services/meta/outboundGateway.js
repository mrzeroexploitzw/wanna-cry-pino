import { db } from '../../database/db.js';
import { checkOutboundText } from '../moderation/outboundPolicy.js';
import { sendMessagePayload as rawSendMessagePayload, sendText as rawSendText, sendMediaMessage as rawSendMediaMessage } from './metaClient.js';

const WINDOW_MS = 60 * 1000;
const DEFAULT_PRIVATE_RATE = 12;
const DEFAULT_GROUP_RATE = 6;
const GLOBAL_MIN_INTERVAL_MS = Math.max(0, Number(process.env.OUTBOUND_MIN_INTERVAL_MS || 250));
let lastSentAt = 0;
let sendChain = Promise.resolve();
const recentSends = new Map();

function within24Hours(userId) {
  const row = db.prepare('SELECT last_inbound_at FROM users WHERE whatsapp_id=?').get(userId);
  if (!row?.last_inbound_at) return false;
  return Date.now() - Date.parse(row.last_inbound_at) <= 24 * 60 * 60 * 1000;
}

function privateAllowed(to, replyTo) {
  return Boolean(replyTo && within24Hours(to));
}

function rateAllowed(key, limit) {
  const nowMs = Date.now();
  const values = (recentSends.get(key) || []).filter(ts => nowMs - ts < WINDOW_MS);
  if (values.length >= limit) return false;
  values.push(nowMs);
  recentSends.set(key, values);
  return true;
}

function enqueue(task) {
  const run = sendChain.then(async () => {
    const wait = Math.max(0, GLOBAL_MIN_INTERVAL_MS - (Date.now() - lastSentAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const result = await task();
    lastSentAt = Date.now();
    return result;
  });
  sendChain = run.catch(() => {});
  return run;
}

function assertPrivatePolicy(to, { group = false, replyTo = null, template = false } = {}) {
  if (group || template) return;
  if (!privateAllowed(to, replyTo)) throw new Error('WHATSAPP_24H_WINDOW_REQUIRED');
}

function assertRate(to, group) {
  const configured = group ? process.env.MAX_GROUP_MESSAGES_PER_MINUTE : process.env.MAX_PRIVATE_MESSAGES_PER_MINUTE;
  const limit = Number(configured || (group ? DEFAULT_GROUP_RATE : DEFAULT_PRIVATE_RATE));
  const key = `${group ? 'group' : 'user'}:${to}`;
  if (!rateAllowed(key, Math.max(1, limit))) throw new Error('OUTBOUND_RATE_LIMIT');
}

function assertSafe(text) {
  if (process.env.OUTBOUND_CONTENT_SAFETY === 'false') return;
  const result = checkOutboundText(text);
  if (!result.allowed) throw new Error(`OUTBOUND_CONTENT_BLOCKED:${result.reason}`);
}

export async function sendSafeText(to, body, options = {}) {
  const { group = false, replyTo = null, mentions = [], template = false } = options;
  assertPrivatePolicy(to, { group, replyTo, template });
  assertSafe(body);
  assertRate(to, group);
  return enqueue(() => rawSendText(to, body, { group, mentions, replyTo }));
}

export async function sendSafeMediaMessage(to, payload) {
  const { group = false, replyTo = null, caption = null, template = false } = payload;
  assertPrivatePolicy(to, { group, replyTo, template });
  if (caption) assertSafe(caption);
  assertRate(to, group);
  return enqueue(() => rawSendMediaMessage(to, payload));
}

export async function sendSafeMessagePayload(payload, { group = false, to, replyTo = null, text = null, template = false } = {}) {
  assertPrivatePolicy(to, { group, replyTo, template });
  if (text) assertSafe(text);
  assertRate(to, group);
  return enqueue(() => rawSendMessagePayload(payload));
}

export function outboundStats() {
  return { lastSentAt, trackedKeys: recentSends.size };
}
