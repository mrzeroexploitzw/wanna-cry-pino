import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { db } from './database/db.js';
import { processWebhook } from './handlers/webhook.js';
import { commandRegistry } from './commands/registry.js';
import { pairingEnabled, listMetaPhoneNumbers, registerMetaPhoneNumber, getPairingStatus } from './services/meta/phonePairingService.js';

const port = Number(process.env.PORT || 3000);
const log = (level, message, meta = {}) => console[level]({ ...meta, message });

function sendJson(res, status, payload) { const body = JSON.stringify(payload); res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }); res.end(body); }
function readRawBody(req) { return new Promise((resolve, reject) => { let body=''; req.on('data', chunk => { body += chunk; if (body.length > 2_000_000) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); } }); req.on('end', () => resolve(body)); req.on('error', reject); }); }
function validSignature(req, raw) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const received = req.headers['x-hub-signature-256'];
  if (typeof received !== 'string') return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  return received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
function pairingAdminAuthorized(req) {
  const expected = process.env.PAIRING_ADMIN_TOKEN;
  return Boolean(expected && req.headers.authorization === `Bearer ${expected}`);
}
function safePairingError(error) {
  const known = new Set(['PHONE_PAIRING_DISABLED','PAIRING_UNAUTHORIZED','PAIRING_ADMIN_TOKEN_NOT_CONFIGURED','INVALID_E164_PHONE_NUMBER','PIN_MUST_BE_6_DIGITS','META_WABA_ID_NOT_CONFIGURED','META_PHONE_NUMBER_NOT_FOUND_IN_WABA']);
  if (known.has(error.message)) return { status: error.message === 'PAIRING_UNAUTHORIZED' ? 401 : 400, error: error.message };
  if (error.message?.startsWith('META_API_FAILED:')) return { status: 502, error: 'META_REGISTRATION_FAILED' };
  return { status: 500, error: 'PAIRING_FAILED' };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status:'ok', service:'thanxie-ai', commands:commandRegistry.length, phone_pairing:pairingEnabled(), time:new Date().toISOString() });
    if (req.method === 'GET' && url.pathname === '/ready') { db.prepare('SELECT 1 AS ok').get(); return sendJson(res,200,{ready:true}); }

    // Secure administrative phone-number onboarding. This registers an eligible
    // WhatsApp Business number with Meta; it is not WhatsApp Web/QR pairing.
    if (url.pathname === '/pairing') {
      if (!pairingEnabled()) return sendJson(res, 404, { error: 'PHONE_PAIRING_DISABLED' });
      if (!pairingAdminAuthorized(req)) return sendJson(res, 401, { error: 'PAIRING_UNAUTHORIZED' });
      if (req.method === 'GET') return sendJson(res, 200, { enabled:true, phone_numbers: await listMetaPhoneNumbers(), pairings:getPairingStatus() });
      if (req.method === 'POST') {
        const raw = await readRawBody(req);
        let payload;
        try { payload = raw ? JSON.parse(raw) : {}; } catch { return sendJson(res,400,{error:'invalid_json'}); }
        try {
          const result = await registerMetaPhoneNumber({ phoneNumber:payload.phone_number, pin:payload.pin, adminToken:process.env.PAIRING_ADMIN_TOKEN });
          return sendJson(res,200,result);
        } catch (error) {
          const mapped = safePairingError(error);
          log('error','PHONE_PAIRING_FAILED',{error:error.message});
          return sendJson(res,mapped.status,{error:mapped.error});
        }
      }
      return res.writeHead(405, {'Allow':'GET, POST'}).end();
    }

    if (req.method === 'GET' && url.pathname === '/webhook') {
      if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === process.env.META_VERIFY_TOKEN) return res.writeHead(200,{'Content-Type':'text/plain'}).end(url.searchParams.get('hub.challenge') || '');
      return res.writeHead(403).end();
    }
    if (req.method === 'POST' && url.pathname === '/webhook') {
      const raw = await readRawBody(req);
      if (!validSignature(req, raw)) return res.writeHead(401).end();
      let payload;
      try { payload = raw ? JSON.parse(raw) : {}; } catch { return sendJson(res, 400, { error: 'invalid_json' }); }
      res.writeHead(200).end();
      processWebhook(payload).catch((error) => log('error', 'WEBHOOK_PROCESSING_FAILED', { error: error.message }));
      return;
    }
    res.writeHead(404).end();
  } catch (error) { log('error','HTTP_ERROR',{error:error.message}); if (!res.headersSent) sendJson(res,500,{error:'internal_error'}); }
});
server.listen(port, () => log('log','THANXIE AI started',{port,commands:commandRegistry.length}));
export { server };
