import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { db } from './database/db.js';
import { commandRegistry } from './commands/registry.js';
import { startWhatsApp, requestPairingCode, pairingStatus } from './services/whatsapp/baileysClient.js';

const port = Number(process.env.PORT || 3000);
const log = (level, message, meta = {}) => console[level]({ ...meta, message });

function sendJson(res, status, payload) { const body = JSON.stringify(payload); res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }); res.end(body); }
function readRawBody(req) { return new Promise((resolve, reject) => { let body=''; req.on('data', chunk => { body += chunk; if (body.length > 100_000) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); } }); req.on('end', () => resolve(body)); req.on('error', reject); }); }
function pairingAdminAuthorized(req) {
  const expected = process.env.PAIRING_ADMIN_TOKEN;
  return Boolean(expected && req.headers.authorization === `Bearer ${expected}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status:'ok', service:'thanxie-ai', commands:commandRegistry.length, whatsapp:pairingStatus(), time:new Date().toISOString() });
    if (req.method === 'GET' && url.pathname === '/ready') { db.prepare('SELECT 1 AS ok').get(); return sendJson(res,200,{ready:true}); }

    // Personal WhatsApp Web-style pairing. The pairing code links the bot's
    // own WhatsApp account; the service never asks users for WhatsApp OTPs.
    if (url.pathname === '/pairing') {
      if (!pairingAdminAuthorized(req)) return sendJson(res, 401, { error: 'PAIRING_UNAUTHORIZED' });
      if (req.method === 'GET') return sendJson(res, 200, pairingStatus());
      if (req.method === 'POST') {
        const raw = await readRawBody(req);
        let payload;
        try { payload = raw ? JSON.parse(raw) : {}; } catch { return sendJson(res,400,{error:'INVALID_JSON'}); }
        try {
          const result = await requestPairingCode(payload.phone_number);
          return sendJson(res,200,{ ok:true, ...result });
        } catch (error) {
          const known = new Set(['WHATSAPP_NOT_INITIALIZED','ALREADY_PAIRED','PAIRING_IN_PROGRESS','INVALID_PHONE_NUMBER']);
          const status = known.has(error.message) ? 400 : 500;
          log('error','PAIRING_FAILED',{error:error.message});
          return sendJson(res,status,{error:known.has(error.message) ? error.message : 'PAIRING_FAILED'});
        }
      }
      return res.writeHead(405, {'Allow':'GET, POST'}).end();
    }

    res.writeHead(404).end();
  } catch (error) { log('error','HTTP_ERROR',{error:error.message}); if (!res.headersSent) sendJson(res,500,{error:'INTERNAL_ERROR'}); }
});

server.listen(port, async () => {
  log('log','THANXIE AI started',{port,commands:commandRegistry.length});
  try { await startWhatsApp(); } catch (error) { log('error','WHATSAPP_START_FAILED',{error:error.message}); }
});

export { server };
