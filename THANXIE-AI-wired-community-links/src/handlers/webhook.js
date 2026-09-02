import fs from 'node:fs';
import path from 'node:path';
import { handleMessage } from './messages.js';
import { uploadMedia, downloadMedia } from '../services/meta/metaClient.js';
import { sendSafeText, sendSafeMediaMessage } from '../services/meta/outboundGateway.js';
import { db } from '../database/db.js';
import { recordInbound } from '../services/registration/registrationService.js';
import { sendGroupText, sendGroupMedia, approveJoinRequests, groupApiEnabled, getGroupInfo } from '../services/meta/groupClient.js';
import { moderationDecision, shouldWarnForAction, warnUser, groupRules, aiModerationCheck } from '../services/moderation/guardianService.js';
import { getGroupSettings } from '../services/moderation/moderationService.js';
import { getActiveBrandImage, activateBrandImage } from '../services/branding/brandingService.js';
import { defaults } from '../../config/defaults.js';
import { recordWelcome, welcomeMessages } from '../services/welcome/welcomeService.js';
import { recordJoin, recordLeave, syncGroupInfo } from '../services/community/groupStatsService.js';

const PARTICIPANT_FIELDS = new Set(['group_participants_update', 'group_participant_update', 'participants']);

function groupIdOf(message, value) {
  return message?.group_id || message?.groupId || message?.context?.group_id || value?.group_id || value?.groupId || null;
}
function mediaTypeOf(message) { return ['image', 'video', 'audio', 'document', 'sticker'].includes(message?.type) ? message.type : null; }
function messageTextOf(message) { return message?.type === 'text' ? message.text?.body || '' : message?.[message?.type]?.caption || ''; }
function mentionsOf(message) { return message?.context?.mentioned_participants || message?.mentions || message?.context?.mentions || []; }
function isViewOnce(message) { const media = message?.[message?.type]; return Boolean(media?.view_once || media?.viewOnce || message?.view_once || message?.viewOnce); }
function participantId(value) { return typeof value === 'string' ? value : value?.wa_id || value?.id || value?.user || value?.phone || null; }
function participantName(value) { return typeof value === 'object' ? value?.name || value?.display_name || value?.profile?.name || null : null; }
function adminIds(admins = []) { return admins.map(participantId).filter(Boolean); }

let cachedBrandMediaId = null;
async function brandMediaId() {
  const active = getActiveBrandImage();
  if (active.mediaId) return active.mediaId;
  if (cachedBrandMediaId) return cachedBrandMediaId;
  const file = path.resolve(active.path);
  if (!fs.existsSync(file)) throw new Error('BRANDING_IMAGE_UNAVAILABLE');
  const uploaded = await uploadMedia(fs.readFileSync(file), 'image/png', 'thanxie-brand.png');
  cachedBrandMediaId = uploaded.id;
  activateBrandImage({ mediaId: uploaded.id, updatedBy: 'system-default' });
  return cachedBrandMediaId;
}

async function sendBranded({ to, groupId = null, text, mentions = [], replyTo = null }) {
  try {
    const mediaId = await brandMediaId();
    return sendSafeMediaMessage(groupId || to, {
      type: 'image', mediaId, caption: text, group: Boolean(groupId), mentions, replyTo
    });
  } catch (error) {
    console.error({ message: 'BRANDING_IMAGE_UNAVAILABLE', error: error.message });
    if (groupId && groupApiEnabled()) return sendGroupText(groupId, text, mentions);
    return sendSafeText(to, text, { mentions, replyTo });
  }
}

async function sendOutput({ to, groupId, response, replyTo = null }) {
  if (!response?.handled) return;
  await sendBranded({ to, groupId, text: response.text || 'THANXIE AI', mentions: response.mentions || [], replyTo });
  if (!response.mediaOutput) return;

  const uploaded = await uploadMedia(response.mediaOutput.buffer, response.mediaOutput.mimeType, 'thanxie-output');
  if (groupId && groupApiEnabled()) {
    await sendGroupMedia(groupId, { type: response.mediaOutput.type, mediaId: uploaded.id, caption: response.mediaOutput.caption || null });
  } else {
    await sendSafeMediaMessage(to, { type: response.mediaOutput.type, mediaId: uploaded.id, caption: response.mediaOutput.caption || null, replyTo });
  }
}

async function processModeration({ message, groupId, name }) {
  if (!groupId) return false;
  const decision = moderationDecision({
    groupId,
    text: messageTextOf(message),
    mediaType: mediaTypeOf(message),
    mentions: mentionsOf(message),
    isViewOnce: isViewOnce(message)
  });
  if (!decision.actions.length) return false;

  const actions = decision.actions.filter(shouldWarnForAction);
  if (!actions.length) return false;
  const counts = actions.map(action => ({ action, count: warnUser({ groupId, userId: message.from, reason: action, messageId: message.id || null }) }));
  const reasons = actions.map(action => action === 'link'
    ? 'Links are not allowed.'
    : action === 'badword'
      ? 'Abusive, hateful, sexual or prohibited language is not allowed.'
      : `${action} content is restricted by this group rule.`);
  const highestWarning = Math.max(...counts.map(item => item.count));
  const text = `╭─── 🛡️ THANXIE MODERATION ───╮\n\n@${name || message.from}\n⚠️ This message triggered ${actions.length === 1 ? 'a group protection rule' : `${actions.length} group protection rules`}.\n\n${reasons.map(reason => `• ${reason}`).join('\n')}\n\nWarning #${highestWarning}\n\n📜 GROUP RULES\n${groupRules(groupId)}\n\nPlease follow the rules.\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
  await sendBranded({ to: message.from, groupId, text, mentions: [message.from] });
  return true;
}

function joinRequestIds(value) {
  return (value?.join_requests || value?.requested_participants || value?.participants || [])
    .map(item => typeof item === 'string' ? item : item?.join_request_id || item?.id || item?.request_id)
    .filter(Boolean);
}

async function refreshGroup(groupId) {
  if (!groupId || !groupApiEnabled()) return null;
  try {
    const info = await getGroupInfo(groupId);
    return { info, stats: syncGroupInfo(groupId, info) };
  } catch (error) {
    console.error({ message: 'GROUP_INFO_SYNC_FAILED', error: error.message });
    return null;
  }
}

async function processParticipantEvent(change) {
  const value = change?.value || {};
  const field = change?.field || '';
  if (!PARTICIPANT_FIELDS.has(field) && !value.participants && !value.added_participants && !value.removed_participants && !value.join_requests) return [];

  const groupId = value.group_id || value.groupId || value.group?.id;
  if (!groupId) return [];

  const eventType = String(value.event || value.type || value.group_request_type || value.GROUP_REQUEST_TYPE || '').toLowerCase();
  const suppliedAdmins = value.admins || value.group?.admins || [];
  const results = [];

  if (eventType.includes('join_request') || value.join_requests) {
    const settings = getGroupSettings(groupId);
    if (settings.autoapprove && groupApiEnabled() && process.env.META_GROUP_JOIN_APPROVAL_ENABLED === 'true') {
      const ids = joinRequestIds(value);
      if (ids.length) {
        try { await approveJoinRequests(groupId, ids); }
        catch (error) { console.error({ message: 'AUTOAPPROVE_FAILED', error: error.message }); }
      }
    }
  }

  const added = value.added_participants || value.addedParticipants || ((eventType.includes('join') || eventType === 'group_participant_added') ? value.participants : []) || [];
  const removed = value.removed_participants || value.removedParticipants || ((eventType.includes('leave') || eventType.includes('remove') || eventType === 'group_participant_removed') ? value.participants : []) || [];
  const snapshot = await refreshGroup(groupId);
  const info = snapshot?.info || null;
  const count = snapshot?.stats?.total_members ?? info?.total_participant_count ?? null;
  const apiAdmins = (info?.participants || []).filter(item => item.is_admin || item.admin);
  const admins = apiAdmins.length ? apiAdmins : suppliedAdmins;
  const mentions = adminIds(admins);

  for (const person of added) {
    const userId = participantId(person);
    if (!userId) continue;
    const displayName = participantName(person);
    const stats = recordJoin(groupId, userId, count);
    const welcome = welcomeMessages({ groupId, userId, displayName, admins, description: info?.description || null, totalMembers: count, stats });
    for (const text of welcome) {
      await sendBranded({ to: groupId, groupId, text, mentions: [userId, ...mentions] });
    }
    recordWelcome(groupId, userId);
    results.push({ groupId, userId, type: 'join' });
  }

  for (const person of removed) {
    const userId = participantId(person);
    if (!userId) continue;
    const stats = recordLeave(groupId, userId, count);
    await sendBranded({
      to: groupId,
      groupId,
      text: `╭─── THANXIE AI • FAREWELL ───╮\n\n👋 Goodbye @${participantName(person) || userId}!\n\nThank you for being part of the community. We wish you well on your next journey. ❤️\n\n📊 MEMBERSHIP UPDATE\n👥 Members remaining: ${stats.total_members}\n📉 Total members left: ${stats.left_count}\n📈 Total joined: ${stats.joined_count}\n\nSee you later! 👋\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
      mentions: [userId]
    });
    results.push({ groupId, userId, type: 'leave' });
  }
  return results;
}

async function processIncomingMessage(message, value) {
  if (!message?.id || db.prepare('SELECT 1 FROM processed_messages WHERE message_id=?').get(message.id)) return { duplicate: true };
  db.prepare('INSERT INTO processed_messages(message_id, processed_at) VALUES(?,?)').run(message.id, new Date().toISOString());
  const contact = (value.contacts || []).find(item => item.wa_id === message.from);
  const name = contact?.profile?.name || message.from;
  recordInbound(message.from, name);
  const text = messageTextOf(message);
  const groupId = groupIdOf(message, value);
  const admins = value.admins || value.group?.admins || message.admins || [];
  const isAdmin = adminIds(admins).includes(message.from) || message.from === defaults.ownerWhatsAppId;

  let media = null;
  if (mediaTypeOf(message)) {
    const mediaObject = message[message.type];
    if (mediaObject?.id) {
      try {
        const downloaded = await downloadMedia(mediaObject.id);
        media = { mediaId: mediaObject.id, buffer: downloaded.buffer, contentType: downloaded.contentType, type: message.type, viewOnce: isViewOnce(message) };
      } catch (error) {
        console.error({ message: 'MEDIA_DOWNLOAD_FAILED', error: error.message });
      }
    }
  }

  if (groupId) {
    const aiMod = await aiModerationCheck({ text, imageBuffer: media?.type === 'image' ? media.buffer : null, imageMime: media?.contentType || 'image/jpeg' });
    if (aiMod.flagged) {
      const count = warnUser({ groupId, userId: message.from, reason: 'ai-moderation', messageId: message.id || null });
      await sendBranded({
        to: groupId,
        groupId,
        text: `╭─── 🛡️ THANXIE SAFETY ───╮\n\n@${name}\n⚠️ This content was flagged by the configured safety filter.\n\nWarning #${count}\n\n📜 GROUP RULES\n${groupRules(groupId)}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,
        mentions: [message.from]
      });
      return { moderated: true };
    }
  }

  if (await processModeration({ message, groupId, name })) return { moderated: true };

  const response = await handleMessage({ from: message.from, name, text, groupId, media, isAdmin });
  await sendOutput({ to: message.from, groupId, response, replyTo: message.id || null });
  return { handled: Boolean(response?.handled) };
}

export async function processWebhook(payload) {
  const results = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      try {
        results.push(...await processParticipantEvent(change));
      } catch (error) {
        console.error({ message: 'PARTICIPANT_EVENT_FAILED', error: error.message });
      }

      const value = change?.value || {};
      for (const message of value.messages || []) {
        try {
          results.push({ ...(await processIncomingMessage(message, value)), messageId: message.id || null });
        } catch (error) {
          console.error({ message: 'MESSAGE_PROCESSING_FAILED', error: error.message, messageId: message.id || null });
        }
      }
    }
  }
  return results;
}
