import { db, now } from '../../database/db.js';

export function addPino(ownerId, displayName, targetId = null, source = 'manual', relation = 'friend') {
  const t = now();
  db.prepare(`INSERT INTO pino_pino(owner_whatsapp_id,target_whatsapp_id,display_name,source,relation,score,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?) ON CONFLICT(owner_whatsapp_id,display_name) DO UPDATE SET target_whatsapp_id=excluded.target_whatsapp_id,source=excluded.source,updated_at=excluded.updated_at`).run(ownerId, targetId, displayName, source, relation, t, t);
  return listPino(ownerId);
}
export function removePino(ownerId, displayName) {
  db.prepare('DELETE FROM pino_pino WHERE owner_whatsapp_id=? AND lower(display_name)=lower(?)').run(ownerId, displayName);
  return listPino(ownerId);
}
export function listPino(ownerId) { return db.prepare('SELECT * FROM pino_pino WHERE owner_whatsapp_id=? ORDER BY score DESC, display_name').all(ownerId); }
export function recordInteraction(ownerId, targetId, type = 'message') {
  const t = now();
  db.prepare('INSERT INTO interactions(owner_whatsapp_id,target_whatsapp_id,interaction_type,occurred_at) VALUES(?,?,?,?)').run(ownerId, targetId, type, t);
}
export function suggestPino(ownerId, limit = 5) {
  return db.prepare(`SELECT target_whatsapp_id, COUNT(*) AS score FROM interactions WHERE owner_whatsapp_id=? AND target_whatsapp_id<>? GROUP BY target_whatsapp_id ORDER BY score DESC LIMIT ?`).all(ownerId, ownerId, limit);
}
