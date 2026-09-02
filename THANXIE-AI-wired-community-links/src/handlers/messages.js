import { normalizeCommand, argsOf, maskId } from '../utils/text.js';
import { defaults } from '../../config/defaults.js';
import { languageMenu, languageOptions } from '../../config/languages.js';
import { getUser, startRegistration, acceptTerms, declineTerms, setLanguage, completeRegistration, incrementCommandUsage, blockUser, unblockUser, setLanguagePreferences, setWhatsAppOptIn } from '../services/registration/registrationService.js';
import { applyLanguagePreference, applySlangPreference } from '../services/translation/languageService.js';
import { addPino, removePino, listPino, suggestPino } from '../services/pinoPino/pinoPinoService.js';
import { setGroupFeature, getGroupSettings } from '../services/moderation/moderationService.js';
import { addBadWord, removeBadWord, listBadWords, groupRules, setGroupRules } from '../services/moderation/guardianService.js';
import { mediaQuotaMessage } from '../services/media/mediaService.js';
import { getActiveBrandImage, activateBrandImage, activateBusinessProfileImage, resetBranding } from '../services/branding/brandingService.js';
import { executeCommand, buildMenu, commandStats, searchCommands } from '../services/commands/commandService.js';
import { commandRegistry, commandsByCategory } from '../commands/registry.js';

const terms = `THANXIE AI Terms\n\nBy using THANXIE AI, you agree to:\n\n• Respect other users\n• Do not abuse the service\n• Do not spam\n• Do not use the bot for illegal activity\n• Respect WhatsApp and Meta policies\n• Respect group administrators\n• Do not attempt to abuse APIs`;
const header = title => `╭━━━━━━━━━━━━━━━━━━━━━━╮\n       🤖 THANXIE AI\n        ${title}\n╰━━━━━━━━━━━━━━━━━━━━━━╯`;

function registrationContextAllowed(groupId) {
  return Boolean(groupId && process.env.REGISTRATION_GROUP_ID && groupId === process.env.REGISTRATION_GROUP_ID);
}
function registrationGate(groupId) {
  return `${header('REGISTRATION REQUIRED')}\n\nPlease join the official THANXIE AI registration group and register there.\n\n🔗 ${defaults.registrationGroupLink}\n\nRegistration is not accepted in private chats or other groups.`;
}
function profile(id) { const u = getUser(id); if (!u) return `${header('PROFILE')}\n\nNo profile exists yet. Use .register in the official registration group.`; return `${header('PROFILE')}\n\nName: ${u.display_name || 'WhatsApp User'}\nWhatsApp ID: ${maskId(u.whatsapp_id)}\nUser ID: ${u.id}\nLanguage: ${u.language}\nStatus: ${u.registration_status}\nPremium: ${u.premium_status ? 'ACTIVE' : 'FREE'}\nRegistered: ${u.registered_at || 'Pending'}\nCommands Used: ${u.commands_used}\nXP: ${u.xp}\nLevel: ${u.level}\nSlang: ${u.slang_enabled ? u.slang_style : 'OFF'}`; }

export async function handleMessage({ from, name, text, groupId = null, media = null, isAdmin = false }) {
  const command = normalizeCommand(text);
  const args = argsOf(text);
  const user = getUser(from);
  const lower = text.trim().toLowerCase();

  if (user?.registration_status === 'pending_profile' && !command) {
    completeRegistration(from, text.trim());
    const done = getUser(from);
    return { handled: true, text: `${header('REGISTRATION COMPLETE')}\n\nWelcome to THANXIE AI! ❤️\n\nYou are now registered.\n\n🤖 ${defaults.botName}\nDeveloped by ${defaults.developerName}\n\nLanguage: ${done.language}\n\nOptional WhatsApp updates: reply OPT IN if you want future THANXIE updates.\nReply OPT OUT at any time to stop optional updates.\n\nType .menu to explore the available commands.` };
  }
  if (['opt in','opt-in','optin','yes, opt in','yes opt in'].includes(lower)) {
    setWhatsAppOptIn(from, true);
    return { handled: true, text: `${header('WHATSAPP UPDATES') }\n\nYou have opted in to receive future THANXIE WhatsApp updates when available.\n\nYou can opt out at any time by replying OPT OUT.` };
  }
  if (['opt out','opt-out','optout','unsubscribe','stop'].includes(lower)) {
    setWhatsAppOptIn(from, false);
    return { handled: true, text: `${header('WHATSAPP UPDATES') }\n\nYou have been opted out of future THANXIE WhatsApp updates.\n\nYou can still message THANXIE and receive replies to your messages.` };
  }

  if (!command.startsWith('.')) return { handled: false };

  if (command === '.register') {
    if (!registrationContextAllowed(groupId)) return { handled: true, text: registrationGate(groupId) };
    if (user?.registration_status === 'registered') return { handled: true, text: `${header('ALREADY REGISTERED')}\n\nYou are already registered with THANXIE AI.\n\nUse .profile to view your account.` };
    if (user?.registration_status === 'blocked') return { handled: true, text: `${header('ACCESS DENIED')}\n\nYour THANXIE AI account is blocked. Contact ${defaults.developerName}.` };
    const created = startRegistration(from, name);
    return { handled: true, text: `${header('REGISTER')}\n\nWelcome to THANXIE AI.\n\nDeveloper: ${defaults.developerName}\n\nBefore continuing, please accept the Terms of Service.\n\nReply:\n1. ACCEPT\n2. DECLINE\n\nUse .terms to view the full terms.` };
  }

  if (user?.registration_status === 'pending_terms' && ['1','accept','accepted'].includes(lower)) {
    if (!registrationContextAllowed(groupId)) return { handled: true, text: registrationGate(groupId) };
    acceptTerms(from);
    return { handled: true, text: `${header('SELECT LANGUAGE')}\n\n${languageMenu()}\n\nReply with the number of your preferred language.` };
  }
  if (user?.registration_status === 'pending_terms' && ['2','decline','declined'].includes(lower)) {
    declineTerms(from);
    return { handled: true, text: `${header('TERMS DECLINED')}\n\nRegistration is paused. Send .register in the official registration group when you are ready to accept the Terms of Service.` };
  }
  if (user?.registration_status === 'pending_language' && /^\d+$/.test(text.trim())) {
    if (!registrationContextAllowed(groupId)) return { handled: true, text: registrationGate(groupId) };
    const option = languageOptions.find(x => x.number === Number(text.trim()));
    if (option) { setLanguage(from, option.code); return { handled: true, text: `${header('PROFILE')}\n\nLanguage selected: ${option.name}\n\nWhat name should THANXIE AI use for your profile?\nReply with your display name.` }; }
  }

  if (command === '.terms') return { handled: true, text: `${header('TERMS')}\n\n${terms}\n\nReply ACCEPT or DECLINE.` };
  if (command === '.help' || command === '.menu' || command === '.ping') {
    if (command === '.ping') return { handled: true, text: `${header('PING')}\n\nPong! 🟢\nDeveloper: ${defaults.developerName}` };
    return { handled: true, text: buildMenu(args[0], args[1] || 1) };
  }

  if (!user || user.registration_status !== 'registered') return { handled: true, text: registrationGate(groupId) };
  if (user.registration_status === 'blocked') return { handled: true, text: `${header('ACCESS DENIED')}\n\nYour account is blocked.` };

  if (command === '.profile') return { handled: true, text: profile(from) };
  if (command === '.lang') { const updated = args.length ? applyLanguagePreference(from, args) : user; return { handled: true, text: `${header('LANGUAGE')}\n\nCurrent: ${updated.language}\n\n${languageMenu()}\n\nUse .lang <language> to change it.` }; }
  if (command === '.slang') { const updated = applySlangPreference(from, args); return { handled: true, text: `${header('SLANG')}\n\nStyle: ${updated.slang_style}\nStatus: ${updated.slang_enabled ? 'ON' : 'OFF'}\n\nSupported: Ghana • Naija • Pidgin • mixed` }; }
  if (command === '.style') { const value = args.join(' ') || 'friendly'; setLanguagePreferences(from, { response_tone:value }); return { handled:true, text:`${header('STYLE')}\n\nResponse style: ${value}` }; }
  if (command === '.commands') return { handled:true, text:commandStats() };
  if (command === '.searchcommand') return { handled:true, text:searchCommands(args.join(' ')) };

  if (command.startsWith('.anti') || command === '.badword' || command === '.moderation' || command === '.rules' || command === '.setrules' || command === '.autoapprove') {
    if (!groupId) return { handled:true, text:`${header('GROUP ONLY')}\n\nThis command requires a supported group context.` };
    if (!isAdmin && from !== defaults.ownerWhatsAppId) return { handled:true, text:`${header('ACCESS DENIED')}\n\nGroup-admin permission is required.` };
    if (command === '.rules') return {handled:true,text:`${header('GROUP RULES')}\n\n${groupRules(groupId)}`};
    if (command === '.setrules') { if(!args.length)return {handled:true,text:`${header('RULES')}\n\nUsage: .setrules <rules>`}; setGroupRules(groupId,args.join(' ')); return {handled:true,text:`${header('RULES UPDATED')}\n\nGroup rules updated. New members and moderation warnings will use them.`}; }
    if (command === '.badword') { const action=(args[0]||'list').toLowerCase(); if(action==='add'&&args[1])return {handled:true,text:`${header('BAD WORD FILTER')}\n\nAdded: ${addBadWord(args.slice(1).join(' '),from)}`}; if(action==='remove'&&args[1])return {handled:true,text:`${header('BAD WORD FILTER')}\n\nDisabled: ${removeBadWord(args.slice(1).join(' '))}`}; return {handled:true,text:`${header('BAD WORD FILTER')}\n\nActive custom words: ${listBadWords().length}\n\n.badword add <word>\n.badword remove <word>`}; }
    if (command === '.moderation') { const s=getGroupSettings(groupId); return {handled:true,text:`${header('MODERATION')}\n\n${Object.entries(s).filter(([k])=>k.startsWith('anti')).map(([k,v])=>`${k}: ${v?'ON':'OFF'}`).join('\n')}\n\nUse .anti<feature> on/off.`}; }
    if (command === '.autoapprove') { const enabled=['on','true','1'].includes((args[0]||'').toLowerCase()); setGroupFeature(groupId,'autoapprove',enabled); return {handled:true,text:`${header('AUTO APPROVE')}\n\nStatus: ${enabled?'ON 🟢':'OFF 🔴'}\n\nApproval is performed only through the official Meta Groups API.`}; }
    const feature=command.slice(1); const current=getGroupSettings(groupId); const enabled=args.length?['on','true','1'].includes(args[0].toLowerCase()):!Boolean(current[feature]); try{const s=setGroupFeature(groupId,feature,enabled); return {handled:true,text:`${header(feature)}\n\n${feature}: ${s[feature]?'ON 🟢':'OFF 🔴'}\n\nTHANXIE will apply the configured protection policy.`};}catch{return {handled:true,text:`${header('UNSUPPORTED')}\n\n${feature} is not available in this configuration.`};}
  }

  if (['.setbotimage','.branding','.brandingstatus','.resetbranding','.previewbranding'].includes(command)) return brandingCommand(from,command,args,media);
  if (command === '.block' || command === '.unblock') {
    if (from !== defaults.ownerWhatsAppId) return {handled:true,text:`${header('ACCESS DENIED')}\n\nOwner-only command.`};
    const target=args[0]; if(!target)return {handled:true,text:`Usage: ${command} <whatsapp_id> [reason]`};
    const result=command==='.block'?blockUser(target,args.slice(1).join(' ')||'Blocked by owner',from):unblockUser(target);
    return {handled:true,text:`${header('USER SECURITY')}\n\n${command==='.block'?'Blocked':'Unblocked'} ${maskId(target)}.\nStatus: ${result?.registration_status||'unknown'}`};
  }

  incrementCommandUsage(from);
  return { handled:true, ...(await executeCommand({command,args,from,user:getUser(from),groupId,isAdmin,media})) };
}

async function brandingCommand(from,command,args,media){
  if(from!==defaults.ownerWhatsAppId)return {handled:true,text:`${header('ACCESS DENIED')}\n\nOnly the authenticated owner can change THANXIE AI branding.`};
  if(command==='branding'||command==='brandingstatus'||command==='previewbranding'){const b=getActiveBrandImage();return {handled:true,text:`${header('BRANDING')}\n\nImage: ACTIVE\nMedia ID: ${b.mediaId?maskId(b.mediaId):'LOCAL DEFAULT'}\nTheme: ${b.theme}\nCards: ENABLED\nProfile API: ${b.profilePictureHandle?'UPDATED':'AVAILABLE'}`};}
  if(command==='.resetbranding'){resetBranding(from);return {handled:true,text:`${header('BRANDING UPDATED')}\n\n✅ Default sunset-heart THANXIE AI image restored.`};}
  if(command==='.setbotimage'){
    if(!media?.buffer)return {handled:true,text:`${header('BRANDING')}\n\n📸 Send the new image with caption .setbotimage.`};
    try{const sharp=(await import('sharp')).default;const jpeg=await sharp(media.buffer).jpeg({quality:92}).toBuffer();const uploaded=await (await import('../services/meta/metaClient.js')).uploadMedia(jpeg,'image/jpeg','thanxie-brand.jpg');activateBrandImage({mediaId:uploaded.id,updatedBy:from});try{await activateBusinessProfileImage({buffer:jpeg,updatedBy:from});}catch(error){console.error({message:'PROFILE_IMAGE_UPDATE_FAILED',error:error.message});}return {handled:true,text:`${header('BRANDING UPDATED')}\n\n✅ New brand image activated.\n\nAll supported THANXIE AI cards and menus will use it.`};}catch(error){console.error({message:'BRANDING_IMAGE_UPDATE_FAILED',error:error.message});return {handled:true,text:`${header('BRANDING UPDATE FAILED')}\n\nThe image could not be activated.`};}
  }
  return {handled:true,text:`${header('BRANDING')}\n\nBranding command completed.`};
}
