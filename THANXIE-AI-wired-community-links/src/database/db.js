import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_PATH || './data/thanxie.sqlite';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 whatsapp_id TEXT NOT NULL UNIQUE,
 display_name TEXT,
 language TEXT NOT NULL DEFAULT 'en',
 secondary_language TEXT,
 registration_status TEXT NOT NULL DEFAULT 'pending_terms',
 terms_accepted INTEGER NOT NULL DEFAULT 0,
 registered_at TEXT,
 last_seen TEXT,
 last_inbound_at TEXT,
 whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
 whatsapp_opt_in_at TEXT,
 whatsapp_opt_out_at TEXT,
 premium_status INTEGER NOT NULL DEFAULT 0,
 premium_expiry TEXT,
 xp INTEGER NOT NULL DEFAULT 0,
 level INTEGER NOT NULL DEFAULT 1,
 commands_used INTEGER NOT NULL DEFAULT 0,
 slang_enabled INTEGER NOT NULL DEFAULT 1,
 slang_style TEXT NOT NULL DEFAULT 'ghana-naija-pidgin',
 response_tone TEXT NOT NULL DEFAULT 'friendly',
 response_length TEXT NOT NULL DEFAULT 'short',
 custom_language_instruction TEXT,
 blocked_reason TEXT,
 blocked_at TEXT,
 blocked_by TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(registration_status);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT);
CREATE TABLE IF NOT EXISTS branding (id INTEGER PRIMARY KEY CHECK(id=1),brand_image_media_id TEXT,brand_image_url TEXT,brand_image_hash TEXT,brand_image_updated_at TEXT,brand_image_updated_by TEXT,profile_picture_handle TEXT);
INSERT OR IGNORE INTO branding(id) VALUES(1);
CREATE TABLE IF NOT EXISTS group_settings (group_id TEXT PRIMARY KEY,antisticker INTEGER NOT NULL DEFAULT 0,antiimage INTEGER NOT NULL DEFAULT 0,antivoicenote INTEGER NOT NULL DEFAULT 0,antimention INTEGER NOT NULL DEFAULT 0,antilink INTEGER NOT NULL DEFAULT 1,antivideo INTEGER NOT NULL DEFAULT 0,antiaudio INTEGER NOT NULL DEFAULT 0,antispam INTEGER NOT NULL DEFAULT 0,antiviewonce INTEGER NOT NULL DEFAULT 0,antidelete INTEGER NOT NULL DEFAULT 0,antibad INTEGER NOT NULL DEFAULT 1,autoapprove INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pino_pino (id INTEGER PRIMARY KEY AUTOINCREMENT,owner_whatsapp_id TEXT NOT NULL,target_whatsapp_id TEXT,display_name TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'manual',relation TEXT NOT NULL DEFAULT 'friend',score REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(owner_whatsapp_id,display_name));
CREATE TABLE IF NOT EXISTS interactions (id INTEGER PRIMARY KEY AUTOINCREMENT,owner_whatsapp_id TEXT NOT NULL,target_whatsapp_id TEXT NOT NULL,interaction_type TEXT NOT NULL,occurred_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_interactions_owner_target ON interactions(owner_whatsapp_id,target_whatsapp_id);
CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT,group_id TEXT NOT NULL,user_whatsapp_id TEXT NOT NULL,reason TEXT NOT NULL,message_id TEXT,created_at TEXT NOT NULL,created_by TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_warnings_group_user ON warnings(group_id,user_whatsapp_id);
CREATE TABLE IF NOT EXISTS bad_words (word TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS group_rules (group_id TEXT PRIMARY KEY,rules TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS welcome_events (id INTEGER PRIMARY KEY AUTOINCREMENT,group_id TEXT NOT NULL,user_whatsapp_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(group_id,user_whatsapp_id));
CREATE TABLE IF NOT EXISTS media_usage (id INTEGER PRIMARY KEY AUTOINCREMENT,user_whatsapp_id TEXT NOT NULL,command TEXT NOT NULL,usage_date TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_media_usage_user_command_date ON media_usage(user_whatsapp_id,command,usage_date);
CREATE TABLE IF NOT EXISTS moderation_events (id INTEGER PRIMARY KEY AUTOINCREMENT,group_id TEXT NOT NULL,user_whatsapp_id TEXT NOT NULL,event_type TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS group_stats (group_id TEXT PRIMARY KEY,total_members INTEGER NOT NULL DEFAULT 0,joined_count INTEGER NOT NULL DEFAULT 0,left_count INTEGER NOT NULL DEFAULT 0,last_subject TEXT,last_description TEXT,last_admins TEXT,last_updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS group_member_events (id INTEGER PRIMARY KEY AUTOINCREMENT,group_id TEXT NOT NULL,user_whatsapp_id TEXT NOT NULL,event_type TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS processed_messages (message_id TEXT PRIMARY KEY, processed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS phone_pairings (phone_number TEXT PRIMARY KEY,phone_number_id TEXT NOT NULL,verified_name TEXT,status TEXT NOT NULL DEFAULT 'registered',paired_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_phone_pairings_phone_id ON phone_pairings(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_users_inbound ON users(last_inbound_at);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('group_settings', 'antiviewonce', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('group_settings', 'antidelete', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('group_settings', 'antibad', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('users', 'last_inbound_at', 'TEXT');
ensureColumn('users', 'whatsapp_opt_in', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'whatsapp_opt_in_at', 'TEXT');
ensureColumn('users', 'whatsapp_opt_out_at', 'TEXT');
export const now = () => new Date().toISOString();
