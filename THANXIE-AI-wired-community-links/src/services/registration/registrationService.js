import { db, now } from '../../database/db.js';
import { defaults, registrationStates } from '../../../config/defaults.js';

const insertUser = db.prepare(`INSERT INTO users (whatsapp_id, display_name, language, registration_status, last_seen, created_at, updated_at) VALUES (?, ?, 'en', 'pending_terms', ?, ?, ?)`);
const getUserStmt = db.prepare('SELECT * FROM users WHERE whatsapp_id = ?');

export function getUser(whatsappId) { return getUserStmt.get(whatsappId); }

export function recordInbound(whatsappId, displayName = null) {
  const t = now();
  const user = getUser(whatsappId);
  if (!user) {
    insertUser.run(whatsappId, displayName || 'WhatsApp User', t, t, t);
  } else {
    db.prepare('UPDATE users SET last_inbound_at=?, last_seen=?, display_name=COALESCE(?, display_name), updated_at=? WHERE whatsapp_id=?').run(t, t, displayName, t, whatsappId);
  }
  return getUser(whatsappId);
}

export function touchUser(whatsappId, displayName = null) {
  const t = now();
  const user = getUser(whatsappId);
  if (!user) return null;
  db.prepare('UPDATE users SET last_seen=?, display_name=COALESCE(?, display_name), updated_at=? WHERE whatsapp_id=?').run(t, displayName, t, whatsappId);
  return getUser(whatsappId);
}

export function startRegistration(whatsappId, displayName) {
  const existing = getUser(whatsappId);
  if (existing) return existing;
  const t = now();
  insertUser.run(whatsappId, displayName || 'WhatsApp User', t, t, t);
  return getUser(whatsappId);
}

export function acceptTerms(whatsappId) {
  const t = now();
  db.prepare(`UPDATE users SET terms_accepted=1, registration_status='pending_language', updated_at=? WHERE whatsapp_id=? AND registration_status='pending_terms'`).run(t, whatsappId);
  return getUser(whatsappId);
}

export function declineTerms(whatsappId) {
  const t = now();
  db.prepare(`UPDATE users SET terms_accepted=0, registration_status='pending_terms', updated_at=? WHERE whatsapp_id=?`).run(t, whatsappId);
  return getUser(whatsappId);
}

export function setLanguage(whatsappId, language) {
  const t = now();
  db.prepare(`UPDATE users SET language=?, registration_status='pending_profile', updated_at=? WHERE whatsapp_id=? AND terms_accepted=1`).run(language, t, whatsappId);
  return getUser(whatsappId);
}

export function completeRegistration(whatsappId, displayName) {
  const t = now();
  db.prepare(`UPDATE users SET display_name=COALESCE(?, display_name), registration_status='registered', registered_at=COALESCE(registered_at, ?), last_seen=?, updated_at=? WHERE whatsapp_id=? AND terms_accepted=1`).run(displayName, t, t, t, whatsappId);
  return getUser(whatsappId);
}

export function blockUser(whatsappId, reason, blockedBy) {
  const t = now();
  db.prepare(`UPDATE users SET registration_status='blocked', blocked_reason=?, blocked_at=?, blocked_by=?, updated_at=? WHERE whatsapp_id=?`).run(reason, t, blockedBy, t, whatsappId);
  return getUser(whatsappId);
}

export function unblockUser(whatsappId) {
  const t = now();
  db.prepare(`UPDATE users SET registration_status='registered', blocked_reason=NULL, blocked_at=NULL, blocked_by=NULL, updated_at=? WHERE whatsapp_id=?`).run(t, whatsappId);
  return getUser(whatsappId);
}

export function setWhatsAppOptIn(whatsappId, enabled) {
  const t = now();
  if (enabled) db.prepare('UPDATE users SET whatsapp_opt_in=1, whatsapp_opt_in_at=?, whatsapp_opt_out_at=NULL, updated_at=? WHERE whatsapp_id=?').run(t, t, whatsappId);
  else db.prepare('UPDATE users SET whatsapp_opt_in=0, whatsapp_opt_out_at=?, updated_at=? WHERE whatsapp_id=?').run(t, t, whatsappId);
  return getUser(whatsappId);
}

export function incrementCommandUsage(whatsappId) {
  const t = now();
  db.prepare('UPDATE users SET commands_used=commands_used+1, xp=xp+1, level=1+(xp+1)/100, last_seen=?, updated_at=? WHERE whatsapp_id=?').run(t, t, whatsappId);
}

export function setLanguagePreferences(whatsappId, patch) {
  const user = getUser(whatsappId);
  if (!user) return null;
  const t = now();
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(patch)) {
    const allowed = ['language','secondary_language','slang_enabled','slang_style','response_tone','response_length','custom_language_instruction'];
    if (!allowed.includes(key)) continue;
    fields.push(`${key}=?`); values.push(value);
  }
  if (!fields.length) return user;
  values.push(t, whatsappId);
  db.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at=? WHERE whatsapp_id=?`).run(...values);
  return getUser(whatsappId);
}

export function registrationEnabled() { return defaults.registrationEnabled; }
export function isRegistered(user) { return user?.registration_status === 'registered'; }
export function isBlocked(user) { return user?.registration_status === 'blocked'; }
export function stateIsValid(state) { return registrationStates.includes(state); }
