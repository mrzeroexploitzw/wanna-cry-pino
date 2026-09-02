import { db, now } from '../../database/db.js';
import { getGroupSettings } from './moderationService.js';

const URL_RE = /(?:https?:\/\/|www\.)\S+|(?:[a-z0-9-]+\.)+(?:com|net|org|co\.zw|co\.za|io|app|dev|me|tv|ly|gg)(?:\/\S*)?/i;
const INVITE_RE = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;

// This is a seed lexicon, not a claim of linguistic completeness. The detector also
// normalizes obfuscation and supports admin-managed custom words in SQLite.
const SEED_BAD_WORDS = [
  'fuck','fucking','motherfucker','shit','bullshit','bitch','bastard','asshole','dick','dumbass','idiot',
  'slut','whore','piss','crap','cunt','nigger','nigga','fag','retard','rape','rapist','molest','pedophile',
  'porn','porno','pornography','sexslave','scam','fraud','kill yourself','suicide','murder','terrorist'
];

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSet() {
  const rows = db.prepare('SELECT word FROM bad_words WHERE enabled=1').all();
  return [...new Set([...SEED_BAD_WORDS, ...rows.map(r => r.word)])];
}

export function containsBadWord(text = '') {
  const normalized = normalize(text);
  if (!normalized) return { matched: false, words: [] };
  const matched = wordSet().filter(word => normalized.includes(normalize(word)));
  return { matched: matched.length > 0, words: [...new Set(matched)] };
}

export function hasLink(text = '') {
  return URL_RE.test(text) || INVITE_RE.test(text);
}

export function addBadWord(word, addedBy) {
  const clean = normalize(word);
  if (!clean || clean.length < 2) throw new Error('INVALID_BAD_WORD');
  db.prepare('INSERT INTO bad_words(word,enabled,created_at,updated_at,updated_by) VALUES(?,1,?,?,?) ON CONFLICT(word) DO UPDATE SET enabled=1,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(clean, now(), now(), addedBy);
  return clean;
}

export function removeBadWord(word) {
  const clean = normalize(word);
  db.prepare('UPDATE bad_words SET enabled=0,updated_at=? WHERE word=?').run(now(), clean);
  return clean;
}

export function listBadWords() {
  return db.prepare('SELECT word FROM bad_words WHERE enabled=1 ORDER BY word').all().map(r => r.word);
}

export function warnUser({ groupId, userId, reason, messageId = null, action = 'warn' }) {
  const t = now();
  db.prepare('INSERT INTO warnings(group_id,user_whatsapp_id,reason,message_id,created_at,created_by) VALUES(?,?,?,?,?,?)').run(groupId, userId, reason, messageId, t, 'THANXIE AI');
  db.prepare('INSERT INTO moderation_events(group_id,user_whatsapp_id,event_type,action,created_at) VALUES(?,?,?,?,?)').run(groupId, userId, 'warning', action, t);
  return db.prepare('SELECT COUNT(*) AS count FROM warnings WHERE group_id=? AND user_whatsapp_id=?').get(groupId, userId).count;
}

export function warningCount(groupId, userId) {
  return db.prepare('SELECT COUNT(*) AS count FROM warnings WHERE group_id=? AND user_whatsapp_id=?').get(groupId, userId).count;
}

export function groupRules(groupId) {
  const row = db.prepare('SELECT rules FROM group_rules WHERE group_id=?').get(groupId);
  return row?.rules || process.env.DEFAULT_GROUP_RULES || [
    'Respect everyone in the group.',
    'No spam, scams, or malicious links.',
    'No abusive, hateful, sexual, or illegal content.',
    'No flooding or repeated unwanted media.',
    'Follow group admins and WhatsApp/Meta policies.'
  ].map((x, i) => `${i + 1}. ${x}`).join('\n');
}

export function setGroupRules(groupId, rules) {
  const value = String(rules || '').trim();
  if (!value) throw new Error('RULES_REQUIRED');
  db.prepare('INSERT INTO group_rules(group_id,rules,updated_at) VALUES(?,?,?) ON CONFLICT(group_id) DO UPDATE SET rules=excluded.rules,updated_at=excluded.updated_at').run(groupId, value, now());
  return value;
}

export function moderationDecision({ groupId, text = '', mediaType = null, mentions = [], isViewOnce = false }) {
  if (!groupId) return { actions: [], reasons: [] };
  const settings = getGroupSettings(groupId);
  const actions = [];
  const reasons = [];

  if (settings.antilink && hasLink(text)) { actions.push('link'); reasons.push('link'); }
  if (settings.antibad && containsBadWord(text).matched) { actions.push('badword'); reasons.push('badword'); }
  if (settings.antisticker && mediaType === 'sticker') { actions.push('sticker'); reasons.push('sticker'); }
  if (settings.antiimage && mediaType === 'image') { actions.push('image'); reasons.push('image'); }
  if (settings.antivoicenote && mediaType === 'audio' && mediaType !== 'document') { actions.push('voicenote'); reasons.push('voicenote'); }
  if (settings.antivideo && mediaType === 'video') { actions.push('video'); reasons.push('video'); }
  if (settings.antiaudio && mediaType === 'audio') { actions.push('audio'); reasons.push('audio'); }
  if (settings.antimention && mentions.length > 0) { actions.push('mention'); reasons.push('mention'); }
  if (settings.antiviewonce && isViewOnce) { actions.push('viewonce'); reasons.push('viewonce'); }
  if (settings.antidelete) { /* Anti-delete is capability-gated; there is no message-delete prevention API in the official Groups API. */ }

  return { actions: [...new Set(actions)], reasons: [...new Set(reasons)] };
}

export function shouldWarnForAction(action) {
  return ['link','badword','sticker','image','voicenote','video','audio','mention','viewonce'].includes(action);
}

export async function aiModerationCheck({ text = '', imageBuffer = null, imageMime = 'image/jpeg' }) {
  if (process.env.GEMINI_MODERATION_ENABLED !== 'true') return { checked:false, flagged:false, categories:{} };
  const key = process.env.GEMINI_API_KEY;
  if (!key || (!text && !imageBuffer)) return { checked:false, flagged:false, categories:{} };
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const parts = [{ text: `Classify this WhatsApp group content for obvious policy/safety risk. Return ONLY JSON: {"flagged":true|false,"reason":"brief reason"}. Flag scams, credential theft, sexual exploitation, hateful abuse, credible violent wrongdoing instructions, and illegal commercial activity. Do not flag ordinary profanity by itself.

CONTENT:
${text}` }];
  if (imageBuffer) parts.push({ inline_data: { mime_type: imageMime, data: imageBuffer.toString('base64') } });
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:0,maxOutputTokens:120}})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`GEMINI_MODERATION_FAILED:${response.status}`);
    const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g,''));
    return { checked:true, flagged:Boolean(parsed.flagged), categories: parsed.reason ? { reason: parsed.reason } : {} };
  } catch (error) {
    console.error({message:'GEMINI_MODERATION_FAILED',error:error.message});
    return { checked:false, flagged:false, categories:{} };
  }
}
