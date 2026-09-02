import { defaults } from '../../../config/defaults.js';

function parseLinks(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item, index) => {
        if (typeof item === 'string') return { label: `Link ${index + 1}`, url: item };
        return { label: item?.label || `Link ${index + 1}`, url: item?.url || '' };
      }).filter(item => item.url);
    }
  } catch {}

  return String(value)
    .split(/\r?\n|,/) 
    .map((item, index) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const separator = item.indexOf('|');
      if (separator > 0) return { label: item.slice(0, separator).trim(), url: item.slice(separator + 1).trim() };
      return { label: `Link ${index + 1}`, url: item };
    })
    .filter(item => item.url);
}

export function communityLinks() {
  const groups = parseLinks(process.env.WHATSAPP_GROUP_LINKS, [
    { label: 'Registration Group', url: defaults.registrationGroupLink },
    { label: 'Community Group', url: defaults.groupUrl },
  ]);
  const channels = parseLinks(process.env.WHATSAPP_CHANNEL_LINKS, [
    { label: 'Official WhatsApp Channel', url: defaults.channelUrl },
  ]);
  return { groups: groups.filter(item => item.url), channels: channels.filter(item => item.url) };
}

export function communityLinksText({ cta = true } = {}) {
  const { groups, channels } = communityLinks();
  const lines = [];
  if (cta && channels.length) lines.push('📣 CTA • JOIN OUR OFFICIAL WHATSAPP CHANNEL');
  if (channels.length) {
    lines.push('');
    lines.push('📣 CHANNELS');
    channels.forEach(link => lines.push(`• ${link.label}: ${link.url}`));
  }
  if (groups.length) {
    lines.push('');
    lines.push('👥 GROUPS');
    groups.forEach(link => lines.push(`• ${link.label}: ${link.url}`));
  }
  return lines.join('\n');
}
