/**
 * Servidor de produção do site CTB Finances.
 * - Serve os arquivos estáticos gerados em dist/ (mesma configuração de serve.json).
 * - POST /api/contact: valida o formulário e envia o e-mail pela API do Resend.
 *
 * Variáveis de ambiente (configurar SOMENTE no Railway, nunca no código):
 *   RESEND_API_KEY      chave da API do Resend (obrigatória para enviar)
 *   CONTACT_EMAIL_TO    caixa que recebe as mensagens (obrigatória para enviar)
 *   CONTACT_EMAIL_FROM  remetente autenticado (padrão: "CTB Finances <noreply@ctbfinances.ae>")
 *   CONTACT_DRY_RUN=1   modo de teste: valida tudo mas NÃO envia e-mail
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import handler from 'serve-handler';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 3000);
const serveConfig = { ...JSON.parse(readFileSync(path.join(ROOT, 'public', 'serve.json'), 'utf8')), public: DIST };

const ALLOWED_ORIGINS = new Set([
  'https://ctbfinances.ae',
  'https://www.ctbfinances.ae',
  'https://ctbfinance-production.up.railway.app',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
]);

const LIMITS = { name: [3, 120], email: [5, 160], phone: [0, 25], subject: [2, 80], message: [10, 3000] };
const SUBJECTS = new Set([
  'Intermediação Bancária', 'Análise de Crédito', 'Intermediação de Financiamentos', 'Informações institucionais', 'Outro assunto',
  'Bank Brokerage', 'Credit Review', 'Financing Brokerage', 'Institutional information', 'Other',
]);
// Formulário "Seja nosso cliente"
const CLIENT_TYPES = { individual: 'Pessoa física', company: 'Pessoa jurídica' };
const CLIENT_AREAS = new Set([
  'Intermediação Bancária', 'Análise de Crédito', 'Intermediação de Financiamentos', 'Ainda não sei / Orientação',
  'Bank Brokerage', 'Credit Review', 'Financing Brokerage', 'Not sure yet / Guidance',
]);
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9 ()\-]{7,25}$/;

// Limite simples por IP: 5 envios a cada 15 minutos.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return list.length > MAX_PER_WINDOW;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '');
const oneLine = (v) => clean(v).replace(/[\r\n]+/g, ' ');

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function readBody(req, max = 20_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { req.removeAllListeners('data'); req.resume(); reject(Object.assign(new Error('too large'), { status: 413 })); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validateClient(f) {
  const errors = [];
  const data = {
    form: 'client',
    name: oneLine(f.name), email: oneLine(f.email).toLowerCase(), phone: oneLine(f.phone),
    clientType: oneLine(f.client_type), company: oneLine(f.company), country: oneLine(f.country),
    area: oneLine(f.area), message: clean(f.message), lang: f.lang === 'en' ? 'en' : 'pt',
  };
  const lim = { name: [3, 120], email: [5, 160], phone: [7, 25], country: [2, 80], message: [10, 3000], company: [0, 160] };
  for (const [k, [min, max]] of Object.entries(lim)) {
    const v = data[k];
    if ((min > 0 && v.length < min) || v.length > max) errors.push(k);
  }
  if (!CLIENT_TYPES[data.clientType]) errors.push('client_type');
  if (data.clientType === 'company' && data.company.length < 2) errors.push('company');
  if (data.email && !EMAIL_RE.test(data.email)) errors.push('email');
  if (data.phone && !PHONE_RE.test(data.phone)) errors.push('phone');
  if (!CLIENT_AREAS.has(data.area)) errors.push('area');
  if (f.consent !== true && f.consent !== 'on' && f.consent !== 'true') errors.push('consent');
  data.subject = `Solicitação de relacionamento · ${data.area}`;
  return { data, errors: [...new Set(errors)] };
}

function validate(f) {
  if (f.form === 'client') return validateClient(f);
  const errors = [];
  const data = {
    name: oneLine(f.name), email: oneLine(f.email).toLowerCase(), phone: oneLine(f.phone),
    subject: oneLine(f.subject), message: clean(f.message), lang: f.lang === 'en' ? 'en' : 'pt',
  };
  for (const [k, [min, max]] of Object.entries(LIMITS)) {
    const v = data[k];
    if (min > 0 && v.length < min) errors.push(k);
    else if (v.length > max) errors.push(k);
  }
  if (data.email && !EMAIL_RE.test(data.email)) errors.push('email');
  if (data.phone && !PHONE_RE.test(data.phone)) errors.push('phone');
  if (data.subject && !SUBJECTS.has(data.subject)) errors.push('subject');
  if (f.consent !== true && f.consent !== 'on' && f.consent !== 'true') errors.push('consent');
  return { data, errors: [...new Set(errors)] };
}

async function handleContact(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return sendJson(res, 403, { ok: false, error: 'origin' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (rateLimited(ip)) return sendJson(res, 429, { ok: false, error: 'rate_limit' });

  let fields;
  try {
    const raw = await readBody(req);
    fields = String(req.headers['content-type'] || '').includes('application/json')
      ? JSON.parse(raw)
      : Object.fromEntries(new URLSearchParams(raw));
  } catch (e) {
    return sendJson(res, e.status || 400, { ok: false, error: 'bad_request' });
  }

  // Anti-spam: campo armadilha preenchido ou envio rápido demais (< 3 s) => finge sucesso, não envia.
  const startedAt = Number(fields.started_at || 0);
  if (clean(fields.website) || (startedAt && Date.now() - startedAt < 3000)) return sendJson(res, 200, { ok: true });

  const { data, errors } = validate(fields);
  if (errors.length) return sendJson(res, 422, { ok: false, error: 'validation', fields: errors });

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_EMAIL_TO;
  const from = process.env.CONTACT_EMAIL_FROM || 'CTB Finances <noreply@ctbfinances.ae>';
  if (!key || !to) return sendJson(res, 503, { ok: false, error: 'not_configured' });

  const isClient = data.form === 'client';
  const rows = [
    ['Nome', data.name], ['E-mail', data.email], ['Telefone', data.phone || '—'],
    ...(isClient ? [['Tipo', CLIENT_TYPES[data.clientType]], ['Empresa', data.company || '—'], ['País', data.country], ['Área de interesse', data.area]]
                 : [['Assunto', data.subject]]),
    ['Idioma', data.lang.toUpperCase()],
  ];
  const heading = isClient ? 'Nova solicitação de relacionamento' : 'Nova mensagem pelo site';
  const text = [
    `${heading} — ctbfinances.ae`, '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    'Mensagem:', data.message, '', 'Consentimento para tratamento dos dados: sim',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;color:#35241D;line-height:1.6">
<h2 style="font-family:Georgia,serif;font-weight:400">${heading}</h2>
<table cellpadding="6" style="border-collapse:collapse">
${rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${escapeHtml(v)}</td></tr>`).join('\n')}
</table>
<p style="white-space:pre-wrap;border-left:3px solid #B58B4D;padding-left:12px">${escapeHtml(data.message)}</p>
<p style="font-size:12px;color:#62483A">Consentimento para tratamento dos dados: sim.</p></div>`;

  const payload = {
    from, to: to.split(',').map((s) => s.trim()).filter(Boolean),
    reply_to: data.email,
    subject: `[Site CTB Finances] ${isClient ? 'Seja nosso cliente' : data.subject} — ${data.name}`,
    text, html,
  };

  if (process.env.CONTACT_DRY_RUN === '1') {
    console.log('[contact] DRY_RUN — e-mail validado, não enviado.');
    return sendJson(res, 200, { ok: true, dryRun: true });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.error('[contact] Resend respondeu', r.status); // sem dados pessoais nem chave
      return sendJson(res, 502, { ok: false, error: 'send_failed' });
    }
    console.log('[contact] e-mail enviado');
    return sendJson(res, 200, { ok: true });
  } catch {
    console.error('[contact] falha de rede ao chamar o Resend');
    return sendJson(res, 502, { ok: false, error: 'send_failed' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/contact') {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { ok: false, error: 'method' }); }
    return void handleContact(req, res);
  }
  return handler(req, res, serveConfig);
});

server.listen(PORT, '0.0.0.0', () => {
  const configured = Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_EMAIL_TO);
  console.log(`CTB Finances site na porta ${PORT} · formulário ${configured ? 'ATIVO' : 'sem configuração (responde 503)'}${process.env.CONTACT_DRY_RUN === '1' ? ' · DRY_RUN' : ''}`);
});
