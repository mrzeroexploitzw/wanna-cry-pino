export const defaults = {
  botName: process.env.BOT_NAME || 'THANXIE AI',
  libraryLabel: process.env.LIBRARY_LABEL || 'Meta Muse Spark',
  developerName: process.env.DEVELOPER_NAME || 'THANXIE',
  developerPhone: process.env.DEVELOPER_PHONE || '',
  channelUrl: process.env.WHATSAPP_CHANNEL_URL || '',
  registrationGroupLink: process.env.REGISTRATION_GROUP_LINK || process.env.WHATSAPP_GROUP_URL || '',
  defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
  defaultSlang: process.env.DEFAULT_SLANG || 'ghana-naija-pidgin',
  brandTheme: 'sunset-heart',
  brandPrimary: '#C62828',
  brandAccent: '#FF8A3D',
  brandBackground: '#FFF8F0',
  brandText: '#2B1B17',
  defaultBrandImagePath: process.env.DEFAULT_BRAND_IMAGE_PATH || './assets/branding/thanxie-default.png',
  registrationEnabled: process.env.REGISTRATION_ENABLED !== 'false',
  ownerWhatsAppId: process.env.OWNER_WHATSAPP_ID || '',
  groupUrl: process.env.WHATSAPP_GROUP_URL || '',
  groupLinks: process.env.WHATSAPP_GROUP_LINKS || '',
  channelLinks: process.env.WHATSAPP_CHANNEL_LINKS || '',
  supportUrl: process.env.SUPPORT_URL || '',
  timezone: process.env.DEFAULT_TIMEZONE || 'Africa/Harare',
};

export const registrationStates = ['pending_terms', 'pending_language', 'pending_profile', 'registered', 'blocked'];

export const languages = {
  en: 'English', sn: 'Shona', nd: 'Ndebele', fr: 'French', pt: 'Portuguese', es: 'Spanish', sw: 'Swahili', zu: 'Zulu'
};

export const slangStyles = ['standard', 'ghana', 'naija', 'pidgin', 'ghana-naija-pidgin', 'custom'];
