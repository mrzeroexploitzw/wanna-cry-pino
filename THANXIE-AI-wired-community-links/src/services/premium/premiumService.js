import { db, now } from '../../database/db.js';
export function activatePremium(whatsappId, expiry = null) {
  const t = now();
  db.prepare('UPDATE users SET premium_status=1,premium_expiry=?,updated_at=? WHERE whatsapp_id=?').run(expiry, t, whatsappId);
  return db.prepare('SELECT premium_status,premium_expiry FROM users WHERE whatsapp_id=?').get(whatsappId);
}
export function deactivatePremium(whatsappId) {
  const t = now();
  db.prepare('UPDATE users SET premium_status=0,premium_expiry=NULL,updated_at=? WHERE whatsapp_id=?').run(t, whatsappId);
  return db.prepare('SELECT premium_status,premium_expiry FROM users WHERE whatsapp_id=?').get(whatsappId);
}
