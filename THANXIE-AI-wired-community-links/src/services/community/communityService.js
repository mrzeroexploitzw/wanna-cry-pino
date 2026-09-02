import { db } from '../../database/db.js';
export function leaderboard(limit=10){return db.prepare("SELECT whatsapp_id,display_name,xp,level FROM users WHERE registration_status='registered' ORDER BY xp DESC LIMIT ?").all(limit);}
export function userStats(whatsappId){return db.prepare('SELECT xp,level,commands_used FROM users WHERE whatsapp_id=?').get(whatsappId);}
