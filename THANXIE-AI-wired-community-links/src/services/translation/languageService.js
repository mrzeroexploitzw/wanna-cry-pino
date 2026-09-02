import { languageOptions } from '../../../config/languages.js';
import { setLanguagePreferences } from '../registration/registrationService.js';

export function resolveLanguage(value) {
  const input = String(value || '').trim().toLowerCase();
  const option = languageOptions.find(x => x.code === input || x.name.toLowerCase() === input || String(x.number) === input);
  return option?.code || input || 'en';
}
export function applyLanguagePreference(userId, args) {
  return setLanguagePreferences(userId, { language: resolveLanguage(args.join(' ')) });
}
export function applySlangPreference(userId, args) {
  const raw = args.join(' ').trim().toLowerCase();
  if (!raw || raw === 'on') return setLanguagePreferences(userId, { slang_enabled: 1 });
  if (raw === 'off' || raw === 'standard') return setLanguagePreferences(userId, { slang_enabled: 0, slang_style: 'standard' });
  const style = ['ghana','naija','pidgin','mixed','ghana-naija-pidgin'].includes(raw) ? (raw === 'mixed' ? 'ghana-naija-pidgin' : raw) : 'custom';
  return setLanguagePreferences(userId, { slang_enabled: 1, slang_style: style, custom_language_instruction: style === 'custom' ? raw : null });
}
