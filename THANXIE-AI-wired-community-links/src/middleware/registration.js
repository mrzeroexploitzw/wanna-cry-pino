import { getUser, isBlocked, isRegistered } from '../services/registration/registrationService.js';
import { defaults } from '../../config/defaults.js';

export const PUBLIC_COMMANDS = new Set(['.register','.terms','.help','.menu','.ping','.lang','.profile']);

export function registrationGuard(command, whatsappId) {
  const user = getUser(whatsappId);
  if (PUBLIC_COMMANDS.has(command)) return { allowed: true, user };
  if (isBlocked(user)) return { allowed: false, reason: 'blocked', user };
  if (!defaults.registrationEnabled) return { allowed: true, user };
  if (!isRegistered(user)) return { allowed: false, reason: 'unregistered', user };
  return { allowed: true, user };
}
