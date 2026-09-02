import { db, now } from '../../database/db.js';

function freeLimit() { return Number(process.env.MEDIA_MAX_GENERATIONS_FREE || 10); }
function premiumLimit() { return Number(process.env.MEDIA_MAX_GENERATIONS_PREMIUM || 50); }

function dayKey() { return new Date().toISOString().slice(0, 10); }

export function mediaGenerationLimit(user) {
  if (!user) return 0;
  if (user.whatsapp_id === process.env.OWNER_WHATSAPP_ID) return Number.POSITIVE_INFINITY;
  return user.premium_status ? premiumLimit() : freeLimit();
}

export function mediaGenerationUsage(userId, command, date = dayKey()) {
  return db.prepare('SELECT COUNT(*) AS count FROM media_usage WHERE user_whatsapp_id=? AND command=? AND usage_date=?').get(userId, command, date).count;
}

export function consumeMediaGeneration(user, command) {
  const limit = mediaGenerationLimit(user);
  const date = dayKey();
  const used = mediaGenerationUsage(user.whatsapp_id, command, date);
  if (used >= limit) return { allowed: false, used, limit };
  db.prepare('INSERT INTO media_usage(user_whatsapp_id,command,usage_date,created_at) VALUES(?,?,?,?)').run(user.whatsapp_id, command, date, now());
  return { allowed: true, used: used + 1, limit };
}

export function mediaQuotaMessage(user, command) {
  const used = mediaGenerationUsage(user.whatsapp_id, command);
  const limit = mediaGenerationLimit(user);
  const limitText = Number.isFinite(limit) ? String(limit) : 'UNLIMITED';
  return `🎨 MEDIA QUOTA\n\n${command}\nUsed today: ${used}\nMaximum today: ${limitText}\n\n${user.premium_status ? '💎 Premium quota active.' : 'Upgrade to Premium for a higher generation limit.'}`;
}
