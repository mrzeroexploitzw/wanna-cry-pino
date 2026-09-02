import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { db } from './database/db.js';
import { processWebhook } from './handlers/webhook.js';
import { commandRegistry } from './commands/registry.js';

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
  return received.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { status:'ok', service:'thanxie-ai', commands:commandRegistry.length, time:new Date().toISOString() });
    if (req.method === 'GET' && url.pathname === '/ready') { db.prepare('SELECT 1 AS ok').get(); return sendJson(res,200,{ready:true}); }
    if (req.method === 'GET' && url.pathname === '/webhook') {
      if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === process.env.META_VERIFY_TOKEN) return res.writeHead(200,{'Content-Type':'text/plain'}).end(url.searchParams.get('hub.challenge') || '');
      return res.writeHead(403).end();
    }
    if (req.method === 'POST' && url.pathname === '/webhook') {
      const raw = await readRawBody(req);
      if (!validSignature(req, raw)) return res.writeHead(401).end();
      let payload;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        return sendJson(res, 400, { error: 'invalid_json' });
      }
      res.writeHead(200).end();

      // Acknowledge Meta immediately; process the event in the background.
      processWebhook(payload).catch((error) => {
        log('error', 'WEBHOOK_PROCESSING_FAILED', { error: error.message });
      });
      return;
    }
    res.writeHead(404).end();
  } catch (error) { log('error','HTTP_ERROR',{error:error.message}); if (!res.headersSent) sendJson(res,500,{error:'internal_error'}); }
});
server.listen(port, () => log('log','THANXIE AI started',{port,commands:commandRegistry.length}));
export { server };
