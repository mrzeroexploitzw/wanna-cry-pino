import { db, now } from '../../database/db.js';
const keys = ['antisticker','antiimage','antivoicenote','antimention','antilink','antivideo','antiaudio','antispam','antiviewonce','antidelete','antibad','autoapprove'];
export function getGroupSettings(groupId) {
  const existing = db.prepare('SELECT * FROM group_settings WHERE group_id=?').get(groupId);
  if (existing) return existing;
  const t = now();
  db.prepare('INSERT INTO group_settings(group_id,antilink,antibad,updated_at) VALUES(?,?,?,?)').run(groupId, 1, 1, t);
  return db.prepare('SELECT * FROM group_settings WHERE group_id=?').get(groupId);
}
export function setGroupFeature(groupId, feature, enabled) {
  if (!keys.includes(feature)) throw new Error('Unsupported moderation feature');
  const t = now();
  db.prepare(`INSERT INTO group_settings(group_id,${feature},updated_at) VALUES(?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET ${feature}=excluded.${feature},updated_at=excluded.updated_at`).run(groupId, enabled ? 1 : 0, t);
  return getGroupSettings(groupId);
}
export function listFeatures() { return keys; }
