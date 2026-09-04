import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneNumber } from '../src/services/meta/phonePairingService.js';

test('normalizes valid international phone numbers', () => {
  assert.equal(normalizePhoneNumber('+263781234567'), '263781234567');
  assert.equal(normalizePhoneNumber('263781234567'), '263781234567');
});

test('rejects invalid phone numbers', () => {
  assert.throws(() => normalizePhoneNumber('0781234567'), /INVALID_E164_PHONE_NUMBER/);
  assert.throws(() => normalizePhoneNumber('+0000000000'), /INVALID_E164_PHONE_NUMBER/);
});
