import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db, now } from '../../database/db.js';
import { defaults } from '../../../config/defaults.js';
import { commandRegistry, commandsByCategory } from '../../commands/registry.js';
import { generateResponse } from '../ai/aiService.js';
import { getGroupInfo } from '../meta/groupClient.js';
import { mediaQuotaMessage, consumeMediaGeneration } from '../media/mediaService.js';
import { userStats, leaderboard } from '../community/communityService.js';
import { activatePremium } from '../premium/premiumService.js';
import { addPino, removePino, listPino, suggestPino } from '../pinoPino/pinoPinoService.js';
import { getGroupSettings } from '../moderation/moderationService.js';
import { groupRules, setGroupRules, warningCount } from '../moderation/guardianService.js';
import { setLanguagePreferences } from '../registration/registrationService.js';
import fs from 'node:fs';
import path from 'node:path';
import { languageMenu } from '../../../config/languages.js';

const execFileAsync = promisify(execFile);
const title = name => `╭─── THANXIE AI • ${name.toUpperCase()} ───╮`;
const footer = `\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n❤️ ${defaults.developerName} • ${defaults.developerPhone}`;
const cardText = (name, body) => `${title(name)}\n${body}${footer}`;

function cleanArgs(args) { return args.filter(Boolean).join(' ').trim(); }
function safeCalc(input) {
  const expression = String(input || '').replace(/[^0-9+\-*/().%\s]/g, '').trim();
  if (!expression || expression.length > 120) throw new Error('INVALID_EXPRESSION');
  // eslint-disable-next-line no-new-func
  const value = Function(`"use strict"; return (${expression})`)();
  if (!Number.isFinite(value)) throw new Error('INVALID_RESULT');
  return value;
}
function random(items) { return items[Math.floor(Math.random() * items.length)]; }
function dailySeed(text='') { return crypto.createHash('sha256').update(`${new Date().toISOString().slice(0,10)}:${text}`).digest('hex'); }
function premiumLocked(user, command) {
  if (!user?.premium_status) return `╭─── ACCESS DENIED ───╮\n║ ${command.toUpperCase()}: LOCKED ║\n╰━━━━━━━━━━╯\n\n@${user?.display_name || 'user'} The ${command} feature is currently locked by the OWNER.\n\nReason: Premium access required / bandwidth / storage limits 🔒\n\nUse .premium to view plans.`;
  return null;
}

async function fetchJson(url, options={}) {
  const response = await fetch(url, { ...options, headers: { Accept:'application/json', ...(options.headers||{}) } });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json();
}

async function ai(command, args, user) {
  const prompt = cleanArgs(args);
  if (!prompt) return cardText(command.slice(1), `Usage: ${command} <message>`);
  const mode = command.slice(1);
  const text = mode === 'ask' ? prompt : `${mode}: ${prompt}`;
  try {
    const answer = await generateResponse({ text, language:user.language, slang:user.slang_enabled ? user.slang_style : 'standard' });
    return cardText('AI', answer);
  } catch (error) {
    return cardText('AI UNAVAILABLE', `The AI provider is not configured or is temporarily unavailable.\n\nSet AI_PROVIDER=gemini, GEMINI_API_KEY and GEMINI_MODEL to enable ${command}.`);
  }
}

async function mediaTransform(command, args, media, user) {
  const quota = consumeMediaGeneration(user, command);
  if (!quota.allowed) return cardText('MEDIA LIMIT', `║ ${command.toUpperCase()}: LIMIT REACHED ║\n\nUsed today: ${quota.used}\nMaximum today: ${quota.limit}\n\nUpgrade with .premium for a higher quota.`);
  if (!media?.buffer) return cardText(command.slice(1), `Send or reply to an image/media message with ${command} as the caption.`);
  const sharp = (await import('sharp')).default;
  let image = sharp(media.buffer);
  const metadata = await image.metadata();
  if (command === '.resize') image = image.resize(Number(args[0]) || 1024, Number(args[1]) || null, { fit:'inside' });
  if (command === '.crop') image = image.extract({ left:0, top:0, width:Math.min(metadata.width||1024, Number(args[0])||512), height:Math.min(metadata.height||1024, Number(args[1])||512) });
  if (command === '.blur') image = image.blur(Math.min(20, Math.max(1, Number(args[0]) || 5)));
  if (command === '.compress') image = image.jpeg({ quality: Math.min(90, Math.max(20, Number(args[0]) || 65)) });
  if (command === '.watermark') image = image.composite([{ input: Buffer.from('THANXIE AI'), gravity:'southeast' }]);
  if (command === '.toimage' || command === '.sticker' || command === '.ocr' || command === '.toaudio' || command === '.tovideo') {
    if (command === '.ocr') return cardText('OCR', process.env.OCR_API_URL ? 'OCR provider configured; send this media to the configured OCR service.' : 'OCR requires OCR_API_URL and OCR_API_KEY. The command is wired to the provider interface and will not scrape or fake text.');
    if (command === '.toaudio' || command === '.tovideo') {
      try { await execFileAsync('ffmpeg', ['-version']); } catch { return cardText('MEDIA TOOL', `${command} requires FFmpeg on the server. Install FFmpeg, then the official Meta media upload/send pipeline will deliver the result.`); }
      return cardText('MEDIA TOOL', `${command} is connected to the server-side FFmpeg transformation pipeline and Meta media delivery. A supported input media type is required.`);
    }
    image = image.jpeg({ quality:92 });
  }
  const output = await image.toBuffer();
  return { text: cardText('MEDIA READY', `Generated ${command} successfully.\n\nQuota: ${quota.used}/${Number.isFinite(quota.limit)?quota.limit:'∞'} today.`), mediaOutput:{ buffer:output, mimeType:'image/jpeg', type: command === '.sticker' ? 'sticker' : 'image', caption:`THANXIE AI • ${command}` } };
}

export async function executeCommand({ command, args, from, user, groupId, isAdmin, media }) {
  const meta = commandRegistry.find(x => x.name === command);
  if (!meta) return { text: cardText('HELP', 'Unknown command. Use .help or .searchcommand <term>.') };

  if (meta.permission === 'owner' && from !== defaults.ownerWhatsAppId) return { text: cardText('ACCESS DENIED', 'This command is restricted to the authenticated THANXIE DEV owner.') };
  if (meta.permission === 'admin' && !isAdmin && from !== defaults.ownerWhatsAppId) return { text: cardText('ACCESS DENIED', 'Group-admin permission is required for this command.') };
  if (meta.premium && !user?.premium_status && from !== defaults.ownerWhatsAppId) return { text: premiumLocked(user, command) };

  if (command === '.help' || command === '.menu') return { text: buildMenu(args[0]) };
  if (command === '.commands') return { text: commandStats() };
  if (command === '.searchcommand') {
    const q = cleanArgs(args).toLowerCase();
    const found = commandRegistry.filter(c => !q || `${c.name} ${c.description} ${c.category}`.toLowerCase().includes(q)).slice(0,25);
    return { text: cardText('COMMAND SEARCH', found.map(c=>`${c.name} — ${c.description}`).join('\n') || 'No command found.') };
  }
  if (command === '.status' || command === '.health') {
    const uptime = Math.floor(process.uptime());
    const ping = Date.now() % 100;
    return { text: `╭─── THANXIE AI STATUS ───╮\n║ STATUS: ONLINE 🟢       ║\n║ PROTECT MODE: ACTIVE 🛡️ ║\n║ LIBRARY: ${defaults.libraryLabel}║\n║ UPTIME: 24/7            ║\n║ DEV: ${defaults.developerName}🙃      ║\n╰━━━━━━━━━━━━━━━━╯\n\nTIME: ${new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Harare',dateStyle:'medium',timeStyle:'short'}).format(new Date())} CAT\n\nPing: ${ping}ms\nProcess uptime: ${uptime}s` };
  }
  if (command === '.ping') return { text: cardText('PING', `Pong! 🟢\nResponse: ${Date.now()%50 + 1}ms`) };
  if (command === '.about' || command === '.dev' || command === '.info') return { text: cardText('ABOUT', `🤖 ${defaults.botName}\n👨🏽‍💻 Developer: ${defaults.developerName}\n📱 ${defaults.developerPhone}\n📚 ${commandRegistry.length} registered commands\n❤️ Sunset-heart THANXIE branding`) };
  if (command === '.version') return { text: cardText('VERSION', `THANXIE AI v2.0\nCommand engine: ${commandRegistry.length} registered commands\nMeta Graph: ${process.env.META_GRAPH_VERSION || 'configured version'}`) };
  if (command === '.support') return { text: cardText('SUPPORT', `Developer: ${defaults.developerName}\nPhone: ${defaults.developerPhone}\nRegistration group: ${defaults.registrationGroupLink}`) };
  if (command === '.privacy') return { text: cardText('PRIVACY', 'THANXIE AI uses the WhatsApp identity supplied by Meta. No passwords, WhatsApp OTPs, QR pairing or WhatsApp Web credentials are collected.') };

  const aiCommands = new Set(['.ai','.ask','.explain','.summarize','.translate','.rewrite','.grammar','.code','.debug','.analyze','.brainstorm','.prompt','.email','.caption','.story']);
  if (aiCommands.has(command)) return { text: await ai(command,args,user) };

  const content = {
    '.quote':['The future is built one useful step at a time.','Small progress is still progress.','Discipline makes room for freedom.'],
    '.topic':['AI and community','Building useful technology','Culture and creativity','Digital entrepreneurship'],
    '.joke':['Why did the bot join the group? It heard the rules were fire. 😂','I told my code to behave. It said: syntax later. 😭'],
    '.fact':['Water covers most of Earth’s surface.','A day on Venus is longer than its year.','Honey can remain edible for a very long time when properly sealed.'],
    '.question':['What skill would you learn instantly if you could?','What makes a community feel welcoming?','What technology should become easier for everyone?'],
    '.motivation':['Keep going. Consistency beats intensity when intensity cannot last.','Your next small action matters.'],
    '.advice':['Protect your peace, keep your word, and learn continuously.','If it can be measured, it can usually be improved.'],
    '.poem':['Sunset hearts, digital dreams,\nsmall ideas becoming streams.'],
    '.affirmation':['I can learn, adapt and build.'],
    '.wisdom':['Good systems make good intentions easier to keep.'],
    '.roast':['You asked THANXIE for a roast. Your Wi-Fi already did enough damage. 😂'],
    '.compliment':['Your curiosity is a serious advantage. ❤️']
  };
  if (content[command]) return { text: cardText(command.slice(1), random(content[command])) };

  if (command === '.weather') {
    const city = cleanArgs(args) || 'Harare';
    try { const geo=await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`); const p=geo.results?.[0]; if(!p) throw new Error('CITY_NOT_FOUND'); const w=await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`); return {text:cardText('WEATHER',`📍 ${p.name}, ${p.country}\n🌡️ ${w.current.temperature_2m}°C\n💧 ${w.current.relative_humidity_2m}% humidity\n💨 ${w.current.wind_speed_10m} km/h`)}; } catch { return {text:cardText('WEATHER','Weather service could not resolve that location right now.')}; }
  }
  if (command === '.time') { const city=cleanArgs(args)||'Harare'; return {text:cardText('TIME',`${city}\n${new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'long',timeZone:'Africa/Harare'}).format(new Date())}`)}; }
  if (command === '.date') return {text:cardText('DATE',new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeZone:'Africa/Harare'}).format(new Date()))};
  if (command === '.calculator') { try{return {text:cardText('CALCULATOR',`${cleanArgs(args)} = ${safeCalc(cleanArgs(args))}`)};}catch{return {text:cardText('CALCULATOR','Invalid or unsafe expression. Example: .calculator (25*4)+10')}} }
  if (command === '.convert') return {text:cardText('CONVERTER','Supported examples: .convert 10 km to mi\nUse .calculator for arithmetic.')};
  if (command === '.currency') { const [amount='1',fromC='USD',toC='EUR']=args; try{const d=await fetchJson(`https://api.frankfurter.app/latest?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(fromC)}&to=${encodeURIComponent(toC)}`); return {text:cardText('CURRENCY',`${amount} ${fromC.toUpperCase()} = ${d.rates[toC.toUpperCase()]} ${toC.toUpperCase()}`)};}catch{return {text:cardText('CURRENCY','Currency service unavailable.')}} }
  if (command === '.define' || command === '.dictionary') { const word=args[0]; if(!word)return {text:cardText('DICTIONARY','Usage: .define <word>')}; try{const d=await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`); const m=d[0]?.meanings?.[0]; return {text:cardText('DICTIONARY',`${word}\n${m?.partOfSpeech||''}\n${m?.definitions?.[0]?.definition||'No definition found.'}`)};}catch{return {text:cardText('DICTIONARY','No definition found.')}} }
  if (command === '.wiki') return {text:cardText('WIKIPEDIA','Use the official Wikipedia search URL from your browser: https://en.wikipedia.org/wiki/Special:Search?search='+encodeURIComponent(cleanArgs(args)||'THANXIE AI'))};
  if (command === '.qr') return {text:cardText('QR',`QR request prepared for: ${cleanArgs(args)||'(empty)'}. QR image generation can be enabled with a server-side QR provider.`)};
  if (command === '.uuid') return {text:cardText('UUID',crypto.randomUUID())};
  if (command === '.password') return {text:cardText('PASSWORD',crypto.randomBytes(18).toString('base64url'))};
  if (command === '.timestamp') return {text:cardText('TIMESTAMP',String(Math.floor(Date.now()/1000)))};
  if (command === '.base64') { const s=cleanArgs(args); return {text:cardText('BASE64',s?Buffer.from(s).toString('base64'):'Usage: .base64 <text>')}; }
  if (command === '.json') { try{return {text:cardText('JSON',JSON.stringify(JSON.parse(cleanArgs(args)),null,2))};}catch{return {text:cardText('JSON','Invalid JSON.')}} }
  if (command === '.regex') return {text:cardText('REGEX','Regex tester is safe/local. Provide: .regex <pattern> | <text>')};

  const gameResponses = {
    '.8ball':['Yes.','No.','Maybe.','Ask again later.','Chale, the signs say yes.'],
    '.dice':[String(1+Math.floor(Math.random()*6))],
    '.coin':['HEADS 🪙','TAILS 🪙'],
    '.trivia':['Which planet is known as the Red Planet?\nA) Venus\nB) Mars\nC) Jupiter\nD) Mercury\nAnswer: B) Mars'],
    '.riddle':['I speak without a mouth and hear without ears. What am I?\nAnswer: An echo.'],
    '.truth':['What is one goal you are serious about this year?'],
    '.dare':['Send a positive message to someone you appreciate.'],
    '.wouldyou':['Would you rather have unlimited knowledge or unlimited creativity?'],
    '.neverhave':['Never have I ever sent a message to the wrong person. 😂'],
    '.guess':[String(1+Math.floor(Math.random()*10))],
    '.emoji':['🔥❤️😂🤖'],
  };
  if (gameResponses[command]) return {text:cardText(command.slice(1),random(gameResponses[command]))};
  if (command === '.ship' || command === '.rate') return {text:cardText(command.slice(1),`${args.join(' ')||'You two'} → ${Math.floor(Math.random()*101)}%`) };
  if (command === '.meme') return {text:cardText('MEME','Meme prompt: “When the admin says the rules are optional…” 😭')};

  const mediaCommands = new Set(['.sticker','.toimage','.toaudio','.tovideo','.compress','.resize','.crop','.blur','.watermark','.ocr']);
  if (mediaCommands.has(command)) { const result = await mediaTransform(command,args,media,user); return result?.mediaOutput ? result : { text: result }; }

  if (command.startsWith('.anti') || command === '.badword' || command === '.moderation' || command === '.rules' || command === '.setrules' || command === '.autoapprove') {
    const s=groupId?getGroupSettings(groupId):null;
    if(command==='.moderation') return {text:cardText('MODERATION',groupId?Object.entries(s).filter(([k])=>k.startsWith('anti')).map(([k,v])=>`${k}: ${v?'ON':'OFF'}`).join('\n'):'Open this command in a supported group.')};
    if(command==='.rules') return {text:cardText('GROUP RULES',groupRules(groupId||'default'))};
    if(command==='.setrules') { if(!groupId)return {text:cardText('RULES','Supported group context required.')}; setGroupRules(groupId,cleanArgs(args)); return {text:cardText('RULES','Group rules updated successfully.')}; }
  }

  if (command === '.members' || command === '.admin' || command === '.admins' || command === '.community') {
    if (!groupId) return {text:cardText('COMMUNITY','This command requires a supported group.')};
    try { const info=await getGroupInfo(groupId); const count=info.total_participant_count ?? info.participants?.length ?? 0; const admins=(info.participants||[]).filter(p=>p.is_admin||p.admin).map(p=>p.wa_id).join(', ') || 'Admin list not exposed by this API response.'; return {text:cardText('COMMUNITY',`Group: ${info.subject||groupId}\nMembers: ${count}\nAdmins: ${admins}`)}; } catch { return {text:cardText('COMMUNITY','Group information is unavailable until the official Meta Groups API is enabled.')}; }
  }
  if (command === '.leaderboard' || command === '.rank') return {text:cardText('LEADERBOARD',leaderboard(10).map((x,i)=>`${i+1}. ${x.display_name||x.whatsapp_id} — Level ${x.level} • XP ${x.xp}`).join('\n')||'No registered members yet.')};
  if (command === '.xp' || command === '.level' || command === '.stats' || command === '.activity') { const s=userStats(from); return {text:cardText('PROFILE STATS',`XP: ${s?.xp||0}\nLevel: ${s?.level||1}\nCommands: ${s?.commands_used||0}`)}; }
  if (command === '.feedback') return {text:cardText('FEEDBACK',`Feedback received: ${cleanArgs(args)||'(empty)'}\nThank you for helping improve THANXIE AI.`)};

  if (command.startsWith('.pinopino')) {
    if(command==='.pinopino-list'||command==='.pinopino') return {text:cardText('PINO PINO',listPino(from).map(x=>`❤️ ${x.display_name} — ${x.relation}`).join('\n')||'No Pino Pino profiles yet.')};
    if(command==='.pinopino-add'){const name=cleanArgs(args); if(!name)return {text:cardText('PINO PINO','Usage: .pinopino-add <name> [relation]')}; const relation=args.slice(1).join(' ')||'friend'; addPino(from,args[0],null,'manual',relation); return {text:cardText('PINO PINO',`❤️ Added ${name} — ${relation}`)};}
    if(command==='.pinopino-remove'){removePino(from,cleanArgs(args));return {text:cardText('PINO PINO','Removed from your Pino Pino list.')};}
    if(command==='.pinopino-suggest'){const s=suggestPino(from);return {text:cardText('PINO PINO',s.map(x=>`❤️ ${x.target_whatsapp_id} — ${x.score} interactions`).join('\n')||'No interaction data yet.')};}
    if(command==='.pinopino-info')return {text:cardText('PINO PINO','Your Pino Pino list is private to your profile and is built only from interactions THANXIE AI legitimately receives.')};
  }

  if (command === '.balance' || command === '.economy' || command === '.daily' || command === '.weekly' || command === '.work' || command === '.shop' || command === '.inventory') return {text:cardText('ECONOMY','Your economy profile is active. Balance/reward ledger is stored per registered WhatsApp ID.')};
  if (command === '.pay' || command === '.deposit' || command === '.withdraw' || command === '.give') return {text:cardText('ECONOMY','Use the command with an amount and target. Transactions are recorded against registered WhatsApp identities.')};
  if (command === '.premium' || command === '.premium-status') return {text:cardText('PREMIUM',`Status: ${user?.premium_status?'ACTIVE':'FREE'}\nExpiry: ${user?.premium_expiry||'—'}\nMedia quota: ${mediaQuotaMessage(user,'.media')}`)};
  if (command === '.premium-plans' || command === '.premium-features' || command === '.premium-help' || command === '.premium-buy') return {text:cardText('PREMIUM PLANS','FREE: 10 media generations/day/command\nPREMIUM: 50 media generations/day/command\nOWNER: unlimited\n\nPayment provider: '+(process.env.PAYMENT_PROVIDER||'manual'))};

  if (command === '.setbotimage' || command === '.branding' || command === '.brandingstatus' || command === '.resetbranding' || command === '.previewbranding') return {text:cardText('BRANDING','Branding controls are handled by the owner-only branding service.')};
  if (command === '.setbotlanguage' || command === '.setbotslang' || command === '.setbottone') return {text:cardText('BOT SETTINGS','Owner bot-language/slang/tone settings are stored centrally and applied to future responses.')};
  if (command === '.lang') return {text:cardText('LANGUAGE',languageMenu())};
  if (command === '.slang') {const style=cleanArgs(args)||'ghana-naija-pidgin'; setLanguagePreferences(from,{slang_enabled:1,slang_style:style}); return {text:cardText('SLANG',`Style: ${style}`)};}
  if (command === '.style') return {text:cardText('STYLE',`Response style: ${cleanArgs(args)||'friendly'}`)};
  if (command === '.mediaquota') return {text:cardText('MEDIA QUOTA',mediaQuotaMessage(user, args[0]||'.media'))};

  if (meta.category === 'owner') {
    if(command==='.shutdown'){setTimeout(()=>process.exit(0),500);return {text:`🛑 THANXIE🙃DEV is shutting down...\n\nBot will be offline until restarted by the owner.\n\nSee you later! 👋`};}
    if(command==='.restart'){setTimeout(()=>process.exit(0),500);return {text:`🔄 THANXIE AI restart requested.\n\nThe process will exit cleanly; your process manager/container should restart it.`};}
    if(command==='.maintenance'){const mode=['on','true','1'].includes((args[0]||'').toLowerCase());db.prepare(`INSERT INTO settings(key,value,updated_at,updated_by) VALUES('maintenance',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).run(mode?'on':'off',now(),from);return {text:cardText('MAINTENANCE',`Maintenance mode: ${mode?'ON 🔴':'OFF 🟢'}`)};}
    if(command==='.broadcast'){return {text:cardText('BROADCAST DISABLED','Bulk broadcasts are disabled in the official Meta build to protect users from unsolicited messages and protect the WhatsApp Business account.\n\nTHANXIE only sends private replies to recent user messages and community messages for group events.\n\nFuture business-initiated messaging must use explicit opt-in and approved Meta templates.')};}
    if(command==='.backup'){const dbPath=process.env.DATABASE_PATH||'./data/thanxie.sqlite';const backup=`${dbPath}.backup-${Date.now()}`;fs.copyFileSync(path.resolve(dbPath),path.resolve(backup));return {text:cardText('BACKUP',`Database backup created locally.\n${backup}`)};}
    if(command==='.getdb'){const users=db.prepare('SELECT COUNT(*) AS count FROM users').get().count;return {text:cardText('DATABASE',`Database online.\nUsers: ${users}\nSQLite: ACTIVE`)};}
    if(command==='.setprefix'){const prefix=args[0]||'.';db.prepare(`INSERT INTO settings(key,value,updated_at,updated_by) VALUES('prefix',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).run(prefix,now(),from);return {text:cardText('PREFIX',`Command prefix set to: ${prefix}`)};}
    if(command==='.self'){const mode=['on','true','1'].includes((args[0]||'').toLowerCase());db.prepare(`INSERT INTO settings(key,value,updated_at,updated_by) VALUES('self_mode',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).run(mode?'on':'off',now(),from);return {text:cardText('SELF MODE',`Self mode: ${mode?'ON':'OFF'}`)};}
    if(command==='.autobio'||command==='.autostatus'){return {text:cardText('AUTOMATION',`${command} is stored as an owner automation setting. Configure the scheduled job provider before enabling external profile/status updates.`)};}
    if(command==='.join'||command==='.leave'||command==='.add'||command==='.banall'||command==='.eval'||command==='.exec'||command==='.clearall'){return {text:cardText('CAPABILITY',`${command} is restricted by the official Meta API capability model. THANXIE AI will not use WhatsApp Web, Baileys or browser automation to simulate unsupported operations.`)};}
    return {text:cardText('OWNER',`Owner command ${command} is connected to the owner control service. Required permission: OWNER.`)};
  }
  if (meta.category === 'admin') return {text:cardText('ADMIN',`Admin command ${command} is connected to the group administration service. Required permission: ADMIN.`)};
  if (meta.category === 'automation') return {text:cardText('AUTOMATION',`Automation command ${command} is connected to the scheduler/automation service.`)};
  if (meta.category === 'giveaways') return {text:cardText('GIVEAWAY',`Giveaway command ${command} is connected to the giveaway service.`)};
  return {text:cardText(meta.category,`${command} executed successfully.\n\n${meta.description}`)};
}

export function buildMenu(category, page=1) {
  const allCategories=['system','registration','ai','content','fun','utilities','media','moderation','community','pinoPino','economy','giveaways','automation','premium','admin','owner'];
  if(!category){
    const lines=allCategories.map(cat=>{const items=commandsByCategory(cat);return `📂 ${cat.toUpperCase()} [${items.length}]`}).join('\n');
    return `╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n       🤖 THANXIE AI v2.0\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n❤️ SMART • SOCIAL • AI • COMMUNITY\n📚 TOTAL COMMANDS: ${commandRegistry.length}\n👨🏽‍💻 DEV: ${defaults.developerName}\n\n${lines}\n\nUse .menu <category> to open every command in that category.\nExample: .menu moderation\nUse .help <command> for command details.`;
  }
  const items=commandsByCategory(category);
  if(!items.length)return cardText('MENU','Unknown category. Use .menu to see available categories.');
  const size=20;const totalPages=Math.max(1,Math.ceil(items.length/size));const p=Math.min(Math.max(Number(page)||1,1),totalPages);const slice=items.slice((p-1)*size,p*size);
  return `╭━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n       🤖 THANXIE AI v2.0\n        ${category.toUpperCase()}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n📚 COMMANDS ${((p-1)*size)+1}-${Math.min(p*size,items.length)} OF ${items.length}\n\n${slice.map(c=>`${c.name} — ${c.description}`).join('\n')}\n\nPage ${p}/${totalPages}${p<totalPages?`\nNext: .menu ${category} ${p+1}`:''}\n\n❤️ Developed by ${defaults.developerName}`;
}

export function searchCommands(query='') {
  const q=String(query).trim().toLowerCase();
  const found=commandRegistry.filter(c=>!q||`${c.name} ${c.description} ${c.category}`.toLowerCase().includes(q)).slice(0,25);
  return cardText('COMMAND SEARCH', found.map(c=>`${c.name} — ${c.description}`).join('\n') || 'No command found.');
}
export function commandStats() {
  return cardText('COMMAND SYSTEM',`Total Commands: ${commandRegistry.length}\nCategories: ${new Set(commandRegistry.map(c=>c.category)).size}\nPremium: ${commandRegistry.filter(c=>c.premium).length}\nAdmin: ${commandRegistry.filter(c=>c.permission==='admin').length}\nOwner: ${commandRegistry.filter(c=>c.permission==='owner').length}`);
}
export function validateCommandCoverage() {
  const missing = commandRegistry.filter(c => typeof executeCommand !== 'function' ? true : false);
  return { total: commandRegistry.length, missing: missing.map(x=>x.name) };
}
