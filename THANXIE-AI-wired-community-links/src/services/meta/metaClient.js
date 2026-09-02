const graphVersion = process.env.META_GRAPH_VERSION || 'v23.0';
const token = process.env.META_ACCESS_TOKEN;
const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

export { graphVersion, token, phoneNumberId };

function headers(extra = {}) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`META_API_FAILED:${response.status}:${JSON.stringify(data)}`);
  return data;
}

export async function graphRequest(path, { method = 'GET', body = undefined, headers: extraHeaders = {} } = {}) {
  if (!token) throw new Error('META_NOT_CONFIGURED');
  const response = await fetch(`https://graph.facebook.com/${graphVersion}${path}`, {
    method,
    headers: method === 'GET' || method === 'DELETE' ? { Authorization: `Bearer ${token}`, ...extraHeaders } : headers(extraHeaders),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return parseResponse(response);
}

export async function sendMessagePayload(payload) {
  if (!token || !phoneNumberId) throw new Error('META_NOT_CONFIGURED');
  return graphRequest(`/${phoneNumberId}/messages`, { method: 'POST', body: payload });
}

export async function sendText(to, body, { group = false, mentions = [], replyTo = null } = {}) {
  const payload = {
    messaging_product: 'whatsapp',
    ...(group ? { recipient_type: 'group' } : {}),
    to,
    type: 'text',
    text: { body, preview_url: true }
  };
  if (replyTo) payload.context = { message_id: replyTo };
  if (mentions.length && process.env.META_GROUP_MENTIONS_ENABLED === 'true') payload.context = { ...(payload.context || {}), mentions };
  return sendMessagePayload(payload);
}

export async function sendMediaMessage(to, { type, mediaId, caption = null, filename = null, group = false, mentions = [], replyTo = null }) {
  if (!['image','video','audio','document','sticker'].includes(type)) throw new Error('UNSUPPORTED_MEDIA_TYPE');
  const media = { id: mediaId };
  if (caption && ['image','video','document'].includes(type)) media.caption = caption;
  if (filename && type === 'document') media.filename = filename;
  const payload = { messaging_product: 'whatsapp', ...(group ? { recipient_type: 'group' } : {}), to, type, [type]: media };
  if (replyTo) payload.context = { message_id: replyTo };
  if (mentions.length && group && process.env.META_GROUP_MENTIONS_ENABLED === 'true') payload.context = { ...(payload.context || {}), mentions };
  return sendMessagePayload(payload);
}

export async function uploadMedia(buffer, mimeType, fileName = 'thanxie-media') {
  if (!token || !phoneNumberId) throw new Error('META_NOT_CONFIGURED');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), fileName);
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  return parseResponse(response);
}

export async function sendBufferMedia(to, { buffer, mimeType, type, caption = null, filename = null, group = false }) {
  const uploaded = await uploadMedia(buffer, mimeType, filename || `thanxie-${type}`);
  return sendMediaMessage(to, { type, mediaId: uploaded.id, caption, filename, group });
}

export async function deleteMedia(mediaId) {
  if (!token || !phoneNumberId) throw new Error('META_NOT_CONFIGURED');
  return graphRequest(`/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(phoneNumberId)}`, { method: 'DELETE' });
}

export async function getBusinessProfile() {
  if (!token || !phoneNumberId) throw new Error('META_NOT_CONFIGURED');
  return graphRequest(`/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`);
}

export async function updateBusinessProfile(payload) {
  if (!token || !phoneNumberId) throw new Error('META_NOT_CONFIGURED');
  return graphRequest(`/${phoneNumberId}/whatsapp_business_profile`, { method: 'POST', body: { messaging_product: 'whatsapp', ...payload } });
}

export async function getMediaDownloadUrl(mediaId) {
  if (!token || !mediaId) throw new Error('META_NOT_CONFIGURED');
  const data = await graphRequest(`/${mediaId}`);
  if (!data.url) throw new Error('META_MEDIA_URL_MISSING');
  return data.url;
}

export async function downloadMedia(mediaId) {
  const mediaUrl = await getMediaDownloadUrl(mediaId);
  const response = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`META_MEDIA_DOWNLOAD_FAILED:${response.status}`);
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

export async function createProfileUploadSession({ fileLength, fileType, fileName }) {
  if (!token) throw new Error('META_NOT_CONFIGURED');
  const params = new URLSearchParams({ file_length: String(fileLength), file_type: fileType, file_name: fileName });
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/app/uploads/?${params.toString()}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error(`META_PROFILE_UPLOAD_SESSION_FAILED:${response.status}`);
  return data.id;
}

export async function uploadProfileImageData(uploadId, buffer, fileType = 'image/jpeg') {
  if (!token) throw new Error('META_NOT_CONFIGURED');
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(uploadId)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': fileType, file_offset: '0' }, body: buffer });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.h) throw new Error(`META_PROFILE_IMAGE_UPLOAD_FAILED:${response.status}`);
  return data.h;
}

export async function updateBusinessProfileImage(profilePictureHandle) {
  return updateBusinessProfile({ profile_picture_handle: profilePictureHandle });
}

export async function sendBrandedCard(to, { body, group = false, brandMediaId = null, mentions = [], replyTo = null }) {
  let mediaId = brandMediaId;
  if (!mediaId) throw new Error('BRAND_MEDIA_ID_REQUIRED');
  return sendMediaMessage(to, { type:'image', mediaId, caption:body, group, mentions, replyTo });
}
