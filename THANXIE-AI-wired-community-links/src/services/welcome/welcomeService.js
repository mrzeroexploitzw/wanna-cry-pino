import { db, now } from '../../database/db.js';
import { groupRules } from '../moderation/guardianService.js';
import { communityLinksText } from '../community/communityLinks.js';

export function recordWelcome(groupId, userId) {
  db.prepare('INSERT OR IGNORE INTO welcome_events(group_id,user_whatsapp_id,created_at) VALUES(?,?,?)').run(groupId, userId, now());
}

function adminLabel(admin) {
  if (typeof admin === 'string') return `@${admin}`;
  return `@${admin?.name || admin?.display_name || admin?.wa_id || admin?.id || 'Group admin'}`;
}

export function welcomeMessages({ groupId, userId, displayName, admins = [], description = null, totalMembers = null, stats = null }) {
  const mention = `@${displayName || userId}`;
  const adminNames = admins.length ? admins.map(adminLabel).join(' ') : '👑 Group admins are available to help.';
  const countLine = totalMembers != null ? `👥 Members now: ${totalMembers}` : '';
  const descriptionLine = description ? `\n\n📝 GROUP DESCRIPTION\n${description}` : '';
  const statsLine = stats ? `\n\n📊 MEMBERSHIP\n👥 Members now: ${stats.total_members}\n📈 Total joined: ${stats.joined_count}\n📉 Total left: ${stats.left_count}` : '';
  const links = communityLinksText({ cta: true });

  return [`╭─── ❤️ THANXIE AI • WELCOME ───╮

👋 Welcome ${mention}!

🤖 You have joined the THANXIE AI community.${countLine ? `\n${countLine}` : ''}${descriptionLine}${statsLine}

👑 ADMINS
${adminNames}

📜 GROUP RULES
${groupRules(groupId)}

${links || '📣 Follow the official THANXIE AI community links shared by the admins.'}

❤️ Please read the rules, respect the admins and enjoy the community.
╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`];
}
