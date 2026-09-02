import { phoneNumberId, graphRequest } from './metaClient.js';
import { sendSafeText, sendSafeMediaMessage } from './outboundGateway.js';

export function groupApiEnabled() { return process.env.META_GROUPS_API_ENABLED === 'true'; }

export async function sendGroupText(groupId, body, mentions = []) {
  if (!groupApiEnabled()) throw new Error('META_GROUPS_API_DISABLED');
  return sendSafeText(groupId, body, { group:true, mentions });
}

export async function sendGroupMedia(groupId, {type,mediaId,caption=null,filename=null}) {
  if (!groupApiEnabled()) throw new Error('META_GROUPS_API_DISABLED');
  return sendSafeMediaMessage(groupId,{type,mediaId,caption,filename,group:true});
}

export async function getGroupInfo(groupId) {
  if (!groupApiEnabled()) throw new Error('META_GROUPS_API_DISABLED');
  return graphRequest(`/${encodeURIComponent(groupId)}?fields=id,subject,description,participants,join_approval_mode,total_participant_count,suspended`);
}

export async function approveJoinRequests(groupId, joinRequestIds) {
  if (!groupApiEnabled()) throw new Error('META_GROUPS_API_DISABLED');
  if (process.env.META_GROUP_JOIN_APPROVAL_ENABLED !== 'true') throw new Error('META_GROUP_JOIN_APPROVAL_DISABLED');
  const ids = joinRequestIds.filter(Boolean);
  if (!ids.length) return {approved_join_requests:[]};
  return graphRequest(`/${encodeURIComponent(groupId)}/join_requests`, {method:'POST',body:{messaging_product:'whatsapp',join_requests:ids}});
}

export async function rejectJoinRequests(groupId, joinRequestIds) {
  if (!groupApiEnabled()) throw new Error('META_GROUPS_API_DISABLED');
  const ids = joinRequestIds.filter(Boolean);
  if (!ids.length) return {rejected_join_requests:[]};
  return graphRequest(`/${encodeURIComponent(groupId)}/join_requests`, {method:'DELETE',body:{messaging_product:'whatsapp',join_requests:ids}});
}

export async function getJoinRequests(groupId) {
  if (!groupApiEnabled()) throw new Error('META_GROUPS_API_DISABLED');
  return graphRequest(`/${encodeURIComponent(groupId)}/join_requests`);
}

// Meta's current Groups API does not expose arbitrary group-message deletion/editing.
export function supportsGroupMessageDeletion() { return false; }
export function supportsGroupViewOnce() { return false; }
