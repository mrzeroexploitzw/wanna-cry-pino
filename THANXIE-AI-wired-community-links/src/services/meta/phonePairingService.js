import { graphRequest } from './metaClient.js';
import { db, now } from '../../database/db.js';

function normalizePhoneNumber(value) {
  const raw = String(value || '').trim();
  if (!/^\+?[1-9][0-9]{7,14}$/.test(raw)) throw new Error('INVALID_E164_PHONE_NUMBER');
  return raw.startsWith('+') ? raw.slice(1) : raw;
}

function assertPairingAdmin(token) {
  const configured = process.env.PAIRING_ADMIN_TOKEN;
  if (!configured) throw new Error('PAIRING_ADMIN_TOKEN_NOT_CONFIGURED');
  if (!token || token !== configured) throw new Error('PAIRING_UNAUTHORIZED');
}

export function pairingEnabled() {
  return process.env.PHONE_PAIRING_ENABLED === 'true';
}

export async function listMetaPhoneNumbers() {
  const wabaId = process.env.META_WABA_ID;
  if (!wabaId) throw new Error('META_WABA_ID_NOT_CONFIGURED');
  return graphRequest(`/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,name_status,quality_rating,account_mode`);
}

export async function findMetaPhoneNumber(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const result = await listMetaPhoneNumbers();
  const match = (result.data || []).find(item => normalizePhoneNumber(item.display_phone_number) === normalized);
  if (!match) throw new Error('META_PHONE_NUMBER_NOT_FOUND_IN_WABA');
  return match;
}

export async function registerMetaPhoneNumber({ phoneNumber, pin, adminToken }) {
  assertPairingAdmin(adminToken);
  if (!pairingEnabled()) throw new Error('PHONE_PAIRING_DISABLED');
  if (!/^[0-9]{6}$/.test(String(pin || ''))) throw new Error('PIN_MUST_BE_6_DIGITS');

  const match = await findMetaPhoneNumber(phoneNumber);
  const result = await graphRequest(`/${encodeURIComponent(match.id)}/register`, {
    method: 'POST',
    body: { messaging_product: 'whatsapp', pin: String(pin) }
  });

  const timestamp = now();
  db.prepare(`INSERT INTO phone_pairings(phone_number, phone_number_id, verified_name, status, paired_at, updated_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(phone_number) DO UPDATE SET phone_number_id=excluded.phone_number_id, verified_name=excluded.verified_name, status=excluded.status, paired_at=excluded.paired_at, updated_at=excluded.updated_at`)
    .run(normalizePhoneNumber(phoneNumber), match.id, match.verified_name || null, 'registered', timestamp, timestamp);

  return { success: true, phone_number: match.display_phone_number, phone_number_id: match.id, verified_name: match.verified_name || null, meta: result };
}

export function getPairingStatus() {
  return db.prepare(`SELECT phone_number, phone_number_id, verified_name, status, paired_at, updated_at FROM phone_pairings ORDER BY updated_at DESC`).all();
}

export { normalizePhoneNumber };
