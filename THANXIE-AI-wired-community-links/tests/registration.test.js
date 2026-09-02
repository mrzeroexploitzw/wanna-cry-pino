import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thanxie-test-'));
process.env.DATABASE_PATH = path.join(tmp, 'test.sqlite');
process.env.DEFAULT_SLANG = 'ghana-naija-pidgin';
process.env.OWNER_WHATSAPP_ID = '26371293759';
const { db } = await import('../src/database/db.js');
const reg = await import('../src/services/registration/registrationService.js');
const moderation = await import('../src/services/moderation/guardianService.js');
const media = await import('../src/services/media/mediaService.js');
const { commandRegistry } = await import('../src/commands/registry.js');

test('new user registration identity is the Meta WhatsApp ID', () => {
  const id = '263700000001';
  reg.startRegistration(id, 'Test User');
  assert.equal(reg.getUser(id).whatsapp_id, id);
  assert.equal(reg.getUser(id).registration_status, 'pending_terms');
});

test('terms acceptance advances to language state', () => {
  const id = '263700000002';
  reg.startRegistration(id, 'Terms User');
  reg.acceptTerms(id);
  assert.equal(reg.getUser(id).terms_accepted, 1);
  assert.equal(reg.getUser(id).registration_status, 'pending_language');
});

test('language selection and completion register the account', () => {
  const id = '263700000003';
  reg.startRegistration(id, 'Profile User');
  reg.acceptTerms(id);
  reg.setLanguage(id, 'sn');
  reg.completeRegistration(id, 'Profile User');
  const user = reg.getUser(id);
  assert.equal(user.language, 'sn');
  assert.equal(user.registration_status, 'registered');
  assert.ok(user.registered_at);
});

test('duplicate registration returns the existing account', () => {
  const id = '263700000004';
  const first = reg.startRegistration(id, 'First');
  const second = reg.startRegistration(id, 'Second');
  assert.equal(first.id, second.id);
  assert.equal(reg.getUser(id).display_name, 'First');
});

test('blocked users are persisted as blocked', () => {
  const id = '263700000005';
  reg.startRegistration(id, 'Blocked');
  reg.blockUser(id, 'test reason', '26371293759');
  assert.equal(reg.getUser(id).registration_status, 'blocked');
  reg.unblockUser(id);
  assert.equal(reg.getUser(id).registration_status, 'registered');
});

test('moderation registry includes the original eight plus new anti-view-once, anti-delete and anti-bad-word controls', () => {
  assert.ok(commandRegistry.length >= 140);
  const coreEight = ['.antisticker','.antiimage','.antivoicenote','.antimention','.antilink','.antivideo','.antiaudio','.antispam'];
  for (const command of coreEight) assert.ok(commandRegistry.some(c => c.name === command));
  for (const command of ['.antiviewonce','.antidelete','.antibad']) assert.ok(commandRegistry.some(c => c.name === command));
});

test('bad-word detector normalizes common obfuscation', () => {
  assert.equal(moderation.containsBadWord('this is sh1t').matched, true);
  assert.equal(moderation.containsBadWord('hello family').matched, false);
});

test('link detector identifies URLs and WhatsApp invite links', () => {
  assert.equal(moderation.hasLink('visit https://example.com now').valueOf(), true);
  assert.equal(moderation.hasLink('chat.whatsapp.com/ABC123').valueOf(), true);
});

test('media quota enforces a daily maximum', () => {
  const id = '263700000006';
  reg.startRegistration(id, 'Media User');
  reg.acceptTerms(id); reg.setLanguage(id, 'en'); reg.completeRegistration(id, 'Media User');
  process.env.MEDIA_MAX_GENERATIONS_FREE = '2';
  const user = reg.getUser(id);
  assert.equal(media.consumeMediaGeneration(user, '.sticker').allowed, true);
  assert.equal(media.consumeMediaGeneration(user, '.sticker').allowed, true);
  assert.equal(media.consumeMediaGeneration(user, '.sticker').allowed, false);
});

test.after(() => db.close());
