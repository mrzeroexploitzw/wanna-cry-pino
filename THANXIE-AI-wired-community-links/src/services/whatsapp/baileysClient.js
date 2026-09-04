import fs from 'node:fs';
import path from 'node:path';
import makeWASocket, { DisconnectReason, downloadMediaMessage, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { handleMessage } from '../../handlers/messages.js';
import { moderationDecision, shouldWarnForAction, warnUser, groupRules, aiModerationCheck } from '../moderation/guardianService.js';
import { getGroupSettings } from '../moderation/moderationService.js';
import { recordInbound } from '../registration/registrationService.js';
import { recordJoin, recordLeave, syncGroupInfo } from '../community/groupStatsService.js';
import { defaults } from '../../../config/defaults.js';
import { authorizeOutbound, markOutbound, recordTransportFailure, reserveQueue, releaseQueue, getSendPolicy } from './behaviorGuard.js';

const authDir = path.resolve(process.env.BAILEYS_AUTH_DIR || './data/baileys-auth');
const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'warn' });
const processedIds = new Map();
const DEDUP_WINDOW_MS = Number(process.env.WA_INBOUND_DEDUP_WINDOW_MS || 300000);
let sock = null;
let reconnectTimer = null;
let pairingInFlight = false;
let started = false;
let registered = false;
let pairingNumber = null;
let reconnectAttempts = 0;
let pairingCooldownUntil = 0;

fs.mkdirSync(authDir, { recursive: true });

function jidToId(jid) { if(!jid)return''; return String(jid).split(':')[0].split('@')[0].replace(/\D/g,''); }
function isGroup(jid) { return String(jid||'').endsWith('@g.us'); }
function messageText(message) { const m=message?.message||{}; return m.conversation||m.extendedTextMessage?.text||m.imageMessage?.caption||m.videoMessage?.caption||m.documentMessage?.caption||''; }
function mediaType(message) { const m=message?.message||{}; if(m.imageMessage)return'image'; if(m.videoMessage)return'video'; if(m.audioMessage)return'audio'; if(m.documentMessage)return'document'; if(m.stickerMessage)return'sticker'; return null; }
function isViewOnce(message) { const m=message?.message||{}; return Boolean(m.imageMessage?.viewOnce||m.videoMessage?.viewOnce); }
function duplicateMessage(id) { const now=Date.now(); for(const [key,time] of processedIds){if(time<now-DEDUP_WINDOW_MS)processedIds.delete(key);} if(processedIds.has(id))return true; processedIds.set(id,now); return false; }

async function groupContext(jid) {
  if(!isGroup(jid)||!sock)return{admins:[],info:null};
  try{const metadata=await sock.groupMetadata(jid);const admins=(metadata.participants||[]).filter(p=>p.admin).map(p=>`${jidToId(p.id)}@s.whatsapp.net`);syncGroupInfo(jid,{id:jid,subject:metadata.subject,description:metadata.desc,total_participant_count:metadata.participants?.length||0,participants:metadata.participants||[]});return{admins,info:metadata};}catch(error){logger.warn({err:error},'GROUP_METADATA_FAILED');return{admins:[],info:null};}
}

export async function sendWhatsAppMessage(jid,content,options={}) {
  if(!sock)throw new Error('WHATSAPP_NOT_CONNECTED');
  if(!reserveQueue())return{skipped:true,reason:'QUEUE_FULL'};
  const text=typeof content==='string'?content:content?.text||'';
  const policy=authorizeOutbound({jid,groupId:options.groupId||(isGroup(jid)?jid:null),sender:options.sender||null,text,kind:options.kind||'text'});
  if(!policy.allowed){releaseQueue();logger.warn({jid,reason:policy.reason},'OUTBOUND_SUPPRESSED');return{skipped:true,reason:policy.reason};}
  if(policy.waitMs)await new Promise(resolve=>setTimeout(resolve,policy.waitMs));
  try{const result=await sock.sendMessage(jid,typeof content==='string'?{text:content}:content);markOutbound({sender:options.sender||null,groupKey:policy.groupKey,fingerprint:policy.fingerprint});return result;}catch(error){releaseQueue();recordTransportFailure(error);logger.error({err:error,jid},'OUTBOUND_SEND_FAILED');throw error;}
}

async function sendResponse(jid,groupId,sender,response){
  if(!response?.handled)return;
  await sendWhatsAppMessage(jid,{text:response.text||'THANXIE AI'},{groupId,sender});
  if(response.mediaOutput?.buffer){const media=response.mediaOutput;const content=media.type==='sticker'?{sticker:media.buffer}:media.type==='video'?{video:media.buffer,caption:media.caption||undefined,mimetype:media.mimeType}:{image:media.buffer,caption:media.caption||undefined,mimetype:media.mimeType};await sendWhatsAppMessage(jid,content,{groupId,sender,kind:media.type||'media'});}
}

async function processIncoming(message) {
  if(!message?.message||message.key?.fromMe)return;
  const id=message.key.id;if(!id||duplicateMessage(id))return;
  const jid=message.key.remoteJid;
  if(!jid||jid==='status@broadcast'||jid.endsWith('@broadcast')||jid.endsWith('@newsletter'))return;
  const from=jidToId(message.key.participant||jid);if(!from)return;
  const groupId=isGroup(jid)?jid:null;
  const text=messageText(message);const name=message.pushName||from;recordInbound(from,name);
  const {admins}=await groupContext(jid);const adminIds=admins.map(jidToId);const isAdmin=adminIds.includes(from)||from===defaults.ownerWhatsAppId;
  const type=mediaType(message);let media=null;
  if(type){try{const buffer=await downloadMediaMessage(message,'buffer',{}, {logger});media={buffer,type,contentType:message.message?.[`${type}Message`]?.mimetype||'application/octet-stream',viewOnce:isViewOnce(message)};}catch(error){logger.warn({err:error},'MEDIA_DOWNLOAD_FAILED');}}

  if(groupId){
    const aiMod=await aiModerationCheck({text,imageBuffer:media?.type==='image'?media.buffer:null,imageMime:media?.contentType||'image/jpeg'});
    if(aiMod.flagged){const count=warnUser({groupId,userId:from,reason:'ai-moderation',messageId:id});await sendWhatsAppMessage(groupId,{text:`╭─── 🛡️ THANXIE SAFETY ───╮\n\n@${name}\n⚠️ This content was flagged by the configured safety filter.\n\nWarning #${count}\n\n📜 GROUP RULES\n${groupRules(groupId)}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,mentions:[message.key.participant||jid]},{groupId,sender:from});return;}
    const decision=moderationDecision({groupId,text,mediaType:type,mentions:[],isViewOnce:isViewOnce(message)});const actions=decision.actions.filter(shouldWarnForAction);
    if(actions.length){const counts=actions.map(action=>warnUser({groupId,userId:from,reason:action,messageId:id}));await sendWhatsAppMessage(groupId,{text:`╭─── 🛡️ THANXIE MODERATION ───╮\n\n@${name}\n⚠️ This message triggered ${actions.length===1?'a group protection rule':`${actions.length} group protection rules`}.\n\n${actions.map(action=>`• ${action==='link'?'Links are not allowed.':action==='badword'?'Abusive, hateful, sexual or prohibited language is not allowed.':`${action} content is restricted by this group rule.`}`).join('\n')}\n\nWarning #${Math.max(...counts)}\n\n📜 GROUP RULES\n${groupRules(groupId)}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,mentions:[message.key.participant||jid]},{groupId,sender:from});return;}
  }
  const response=await handleMessage({from,name,text,groupId,media,isAdmin});await sendResponse(jid,groupId,from,response);
}

async function handleGroupParticipants(update){
  const jid=update.id;if(!jid||!isGroup(jid))return;const participants=update.participants||[];const action=update.action;let info=null;try{info=await sock.groupMetadata(jid);}catch{}const count=info?.participants?.length||null;
  for(const p of participants){const userId=jidToId(p);if(!userId)continue;
    if(action==='add'){const stats=recordJoin(jid,userId,count);const settings=getGroupSettings(jid);if(settings.welcome_enabled!==false)await sendWhatsAppMessage(jid,{text:`╭─── THANXIE AI • WELCOME ───╮\n\n👋 Welcome @${userId}!\n\n📊 MEMBERSHIP UPDATE\n👥 Members: ${count??'unknown'}\n📈 Total joined: ${stats.joined_count}\n\nPlease read the group rules and enjoy the community. ❤️\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,mentions:[`${userId}@s.whatsapp.net`]},{groupId:jid,sender:defaults.ownerWhatsAppId});}
    else if(action==='remove'||action==='leave'){const stats=recordLeave(jid,userId,count);await sendWhatsAppMessage(jid,{text:`╭─── THANXIE AI • FAREWELL ───╮\n\n👋 Goodbye @${userId}!\n\n📊 Members remaining: ${stats.total_members}\n📉 Total members left: ${stats.left_count}\n📈 Total joined: ${stats.joined_count}\n\nSee you later! 👋\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`,mentions:[`${userId}@s.whatsapp.net`]},{groupId:jid,sender:defaults.ownerWhatsAppId});}
  }
}

async function connect(){
  const {state,saveCreds}=await useMultiFileAuthState(authDir);registered=Boolean(state.creds.registered);
  sock=makeWASocket({auth:state,logger,markOnlineOnConnect:false,syncFullHistory:false,generateHighQualityLinkPreview:false});
  sock.ev.on('creds.update',async update=>{registered=Boolean(state.creds.registered);await saveCreds(update);});
  sock.ev.on('messages.upsert',async({messages})=>{for(const message of messages){try{await processIncoming(message);}catch(error){logger.error({err:error,id:message?.key?.id},'MESSAGE_PROCESSING_FAILED');}}});
  sock.ev.on('group-participants.update',async update=>{try{await handleGroupParticipants(update);}catch(error){logger.error({err:error},'GROUP_PARTICIPANT_EVENT_FAILED');}});
  sock.ev.on('connection.update',async({connection,lastDisconnect})=>{
    if(connection==='open'){reconnectAttempts=0;pairingCooldownUntil=0;logger.info({policy:getSendPolicy()},'THANXIE_WHATSAPP_CONNECTED');}
    if(connection==='close'){const code=new Boom(lastDisconnect?.error)?.output?.statusCode;sock=null;if(code===DisconnectReason.loggedOut||code===401){registered=false;logger.error('WHATSAPP_LOGGED_OUT_REPAIR_REQUIRED');return;}if(!started)return;clearTimeout(reconnectTimer);const delay=Math.min(120000,10000*Math.max(1,2**reconnectAttempts));reconnectAttempts+=1;reconnectTimer=setTimeout(()=>connect().catch(error=>logger.error({err:error},'RECONNECT_FAILED')),delay);}
  });
  if(!registered&&process.env.BAILEYS_PAIRING_NUMBER)await requestPairingCode(process.env.BAILEYS_PAIRING_NUMBER);
}

export async function requestPairingCode(phoneNumber){
  if(!sock)throw new Error('WHATSAPP_NOT_INITIALIZED');if(registered)throw new Error('ALREADY_PAIRED');if(Date.now()<pairingCooldownUntil)throw new Error('PAIRING_COOLDOWN');if(pairingInFlight)throw new Error('PAIRING_IN_PROGRESS');
  const normalized=String(phoneNumber||'').replace(/\D/g,'');if(!/^\d{8,15}$/.test(normalized))throw new Error('INVALID_PHONE_NUMBER');pairingInFlight=true;pairingNumber=normalized;
  try{const code=await sock.requestPairingCode(normalized);pairingCooldownUntil=Date.now()+30000;return{phone_number:normalized,pairing_code:code};}finally{pairingInFlight=false;}
}
export function pairingStatus(){return{initialized:Boolean(sock),connected:Boolean(sock?.user),paired:registered,pairing_in_flight:pairingInFlight,phone_number:pairingNumber,policy:getSendPolicy()};}
export async function startWhatsApp(){if(started)return;started=true;await connect();}
export function stopWhatsApp(){started=false;clearTimeout(reconnectTimer);reconnectTimer=null;try{sock?.end?.(new Error('THANXIE_SHUTDOWN'));}catch{}sock=null;}
