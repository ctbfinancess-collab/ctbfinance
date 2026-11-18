/**
 * Servidor de produção do site CTB Finances.
 * - Serve os arquivos estáticos gerados em dist/ (mesma configuração de serve.json).
 * - POST /api/contact: valida o formulário e envia o e-mail pela API do Resend.
 *
 * Variáveis de ambiente (configurar SOMENTE no Railway, nunca no código):
 *   RESEND_API_KEY      chave da API do Resend (obrigatória para enviar)
 *   CONTACT_EMAIL_TO    caixa que recebe as mensagens (obrigatória para enviar)
 *   CONTACT_EMAIL_FROM  remetente autenticado (padrão: "CTB Finances – Site <site@ctbfinances.ae>")
 *   CONTACT_DRY_RUN=1   modo de teste: valida tudo mas NÃO envia e-mail
 *   CONTACT_REPLY_TO    e-mail para respostas na confirmação automática (padrão: primeiro de CONTACT_EMAIL_TO)
 *   NEWSLETTER_SECRET   segredo para assinar os links de confirmação da newsletter (obrigatório p/ newsletter)
 *   RESEND_SEGMENT_ID   (opcional) segmento do Resend onde incluir os inscritos (os contatos já ficam em Público › Contatos)
 *   A gravação de contatos exige chave do Resend com permissão "Full access".
 *
 * POST /api/newsletter, GET /api/newsletter/confirm e GET /api/newsletter/unsubscribe:
 *   inscrição com confirmação por e-mail (double opt-in) e cancelamento por link assinado.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import handler from 'serve-handler';
import crypto from 'node:crypto';

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

import { SITE, RESEND_API, fromAddress, teamList, replyToTeam, sendEmail, brandedHtml } from './server/email-base.mjs';
import { iniciarAreaCliente } from './server/area/iniciar.mjs';
import { ipDoVisitante, chaveDeIp } from './server/area/nucleo.mjs';

// Limite por destinatário para as confirmações automáticas (no máx. 3 por dia por e-mail)
const recipientHits = new Map();
function recipientLimited(email) {
  const now = Date.now(), DAY = 24 * 60 * 60 * 1000;
  const list = (recipientHits.get(email) || []).filter((t) => now - t < DAY);
  list.push(now); recipientHits.set(email, list);
  if (recipientHits.size > 5000) for (const [k, v] of recipientHits) if (!v.some((t) => now - t < DAY)) recipientHits.delete(k);
  return list.length > 3;
}

/** Confirmação automática para quem enviou o formulário. Não repete o conteúdo enviado. */
async function sendAutoReply(data) {
  if (recipientLimited(data.email)) return;
  const en = data.lang === 'en';
  const isClient = data.form === 'client';
  const title = en
    ? (isClient ? 'We have received your request' : 'We have received your message')
    : (isClient ? 'Recebemos a sua solicitação' : 'Recebemos a sua mensagem');
  const paragraphs = en ? [
    'Thank you for contacting CTB Finances.',
    isClient
      ? 'Your relationship request has been received and will be reviewed by our team. A specialist will get in touch to better understand your needs and guide you on the next steps.'
      : 'Your message has been received and our team will reply as soon as possible.',
    'Please do not send personal documents by email. If they are needed, our team will indicate the appropriate channel.',
    isClient ? 'Submitting this request does not represent approval, engagement or account opening.' : '',
    'Kind regards,<br>CTB Finances team',
  ] : [
    'Obrigado por entrar em contato com a CTB Finances.',
    isClient
      ? 'Sua solicitação de relacionamento foi recebida e será analisada pela nossa equipe. Um especialista entrará em contato para entender melhor as suas necessidades e orientar sobre os próximos passos.'
      : 'Sua mensagem foi recebida e nossa equipe responderá o mais breve possível.',
    'Por segurança, não envie documentos pessoais por e-mail. Caso sejam necessários, nossa equipe indicará o canal adequado.',
    isClient ? 'O envio desta solicitação não representa aprovação, contratação ou abertura de conta.' : '',
    'Atenciosamente,<br>Equipe CTB Finances',
  ];
  const ps = paragraphs.filter(Boolean);
  await sendEmail({
    from: fromAddress(), to: [data.email], reply_to: replyToTeam(),
    subject: `${title} · CTB Finances`,
    html: brandedHtml(data.lang, title, ps),
    text: [title, '', ...ps.map((x) => x.replace(/<br>/g, '\n')), '', 'CTB FINANCE BROKER L.L.C. · ctbfinances.ae'].join('\n'),
  }, 'confirmação automática');
}

async function handleContact(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return sendJson(res, 403, { ok: false, error: 'origin' });

  const ip = chaveDeIp(ipDoVisitante(req));
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
  // guarda o pedido para o Admin (aba Interessados); falha aqui não impede o e-mail à equipe
  if (areaCliente) await areaCliente.registrarInteressado(data).catch((e) => console.error('[interessados] não gravou:', e.message));

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_EMAIL_TO;
  const from = process.env.CONTACT_EMAIL_FROM || 'CTB Finances – Site <site@ctbfinances.ae>';
  if (!key || !to) return sendJson(res, 503, { ok: false, error: 'not_configured' });

  const isClient = data.form === 'client';
  const rows = [
    ['Nome', data.name], ['E-mail', data.email], ['Telefone', data.phone || '—'],
    ...(isClient ? [['Tipo', CLIENT_TYPES[data.clientType]], ['Empresa', data.company || '—'], ['País', data.country], ['Área de interesse', data.area]]
                 : [['Assunto', data.subject]]),
    ['Idioma', data.lang.toUpperCase()],
  ];
  const heading = isClient ? 'Nova solicitação de relacionamento' : 'Nova mensagem pelo site';
  const footer = 'Mensagem enviada pelo formulário do site ctbfinances.ae. Para responder, use "Responder": a resposta vai direto para o e-mail do remetente.';
  const text = [
    `${heading} — ctbfinances.ae`, '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    'Mensagem:', data.message, '', 'Consentimento para tratamento dos dados: sim', '', '—', footer,
  ].join('\n');
  const html = brandedHtml('pt', heading, [
    { html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;font-family:Georgia,serif;font-size:15px;color:#35241D">${rows.map(([k, v]) => `<tr><td style="padding:5px 14px 5px 0;font-weight:bold;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:5px 0">${escapeHtml(v)}</td></tr>`).join('')}</table>` },
    { html: `<p style="margin:0 0 16px;padding-left:14px;border-left:3px solid #B58B4D;white-space:pre-wrap;font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#35241D">${escapeHtml(data.message)}</p>` },
    '<span style="font-size:13px;color:#62483A">Consentimento para tratamento dos dados: sim.</span>',
    `<span style="font-size:13px;color:#62483A">${footer}</span>`,
  ]);

  const payload = {
    from, to: to.split(',').map((s) => s.trim()).filter(Boolean),
    reply_to: data.email,
    subject: isClient ? `Nova solicitação de relacionamento — ${data.name}` : `Nova mensagem pelo site: ${data.subject} — ${data.name}`,
    text, html,
  };

  const ok = await sendEmail(payload, isClient ? 'solicitação de relacionamento' : 'mensagem de contato');
  if (!ok) return sendJson(res, 502, { ok: false, error: 'send_failed' });
  await sendAutoReply(data); // falha aqui não afeta o envio principal
  return sendJson(res, 200, { ok: true });
}

// ---------- Newsletter (double opt-in) ----------
const b64url = (buf) => Buffer.from(buf).toString('base64url');
function signToken(email, lang, purpose = 'c') {
  const body = b64url(JSON.stringify({ e: email, l: lang, t: Date.now(), p: purpose }));
  const sig = crypto.createHmac('sha256', process.env.NEWSLETTER_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', process.env.NEWSLETTER_SECRET).update(body).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (d.p !== 'u' && Date.now() - d.t > 7 * 24 * 60 * 60 * 1000) return { expired: true, ...d }; // link de cancelamento não expira
    return d;
  } catch { return null; }
}
const newsletterReady = () => Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_EMAIL_TO && process.env.NEWSLETTER_SECRET);

async function handleNewsletter(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return sendJson(res, 403, { ok: false, error: 'origin' });
  const ip = chaveDeIp(ipDoVisitante(req));
  if (rateLimited(ip)) return sendJson(res, 429, { ok: false, error: 'rate_limit' });
  let f;
  try {
    const raw = await readBody(req, 5000);
    f = String(req.headers['content-type'] || '').includes('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch (e) { return sendJson(res, e.status || 400, { ok: false, error: 'bad_request' }); }
  const startedAt = Number(f.started_at || 0);
  if (clean(f.website) || (startedAt && Date.now() - startedAt < 2000)) return sendJson(res, 200, { ok: true });
  const email = oneLine(f.email).toLowerCase();
  const lang = f.lang === 'en' ? 'en' : 'pt';
  const errors = [];
  if (!email || email.length > 160 || !EMAIL_RE.test(email)) errors.push('email');
  if (f.consent !== true && f.consent !== 'on' && f.consent !== 'true') errors.push('consent');
  if (errors.length) return sendJson(res, 422, { ok: false, error: 'validation', fields: errors });
  if (!newsletterReady()) return sendJson(res, 503, { ok: false, error: 'not_configured' });
  if (!recipientLimited(email)) {
    const link = `${SITE}/api/newsletter/confirm?t=${signToken(email, lang)}`;
    const en = lang === 'en';
    const title = en ? 'Confirm your Subscription' : 'Confirme a sua Inscrição';
    const ps = en
      ? ['Thank you for your interest in the <b>CTB Finances</b> newsletter.', 'To start receiving our content and institutional updates, please confirm your email by clicking the button below.', 'The link is valid for 7 days.', 'If you did not request this subscription, simply ignore this email.']
      : ['Obrigado pelo interesse na newsletter da <b>CTB Finances</b>.', 'Para começar a receber nossos conteúdos e novidades institucionais, confirme o seu e-mail clicando no botão abaixo.', 'O link é válido por 7 dias.', 'Se você não solicitou esta inscrição, basta ignorar este e-mail.'];
    await sendEmail({
      from: fromAddress(), to: [email], reply_to: replyToTeam(),
      subject: `${title} · CTB Finances`,
      html: brandedHtml(lang, title, ps, { href: link, label: en ? 'Confirm Subscription' : 'Confirmar Inscrição' }),
      text: [title, '', ...ps.map((x) => x.replace(/<[^>]+>/g, '')), '', link].join('\n'),
    }, 'confirmação de newsletter');
  }
  return sendJson(res, 200, { ok: true }); // resposta igual sempre (não revela se o e-mail já existe)
}

async function handleNewsletterConfirm(url, res) {
  const d = newsletterReady() ? readToken(url.searchParams.get('t')) : null;
  const page = (lang, status) => {
    res.writeHead(303, { Location: `${lang === 'en' ? '/en/newsletter/' : '/newsletter/'}?status=${status}`, 'Cache-Control': 'no-store' });
    res.end();
  };
  if (!d) return page('pt', 'error');
  if (d.expired) return page(d.l, 'expired');
  const email = String(d.e).toLowerCase();
  if (!EMAIL_RE.test(email)) return page(d.l, 'error');
  if (d.p && d.p !== 'c') return page(d.l, 'error');
  // 1) cadastra em Resend › Público › Contatos (API atual: POST /contacts; se já existir, reativa com PATCH)
  const saved = await upsertContact(email, false);
  // 2) avisa a equipe (assim nenhum inscrito se perde, mesmo sem lista configurada)
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  await sendEmail({
    from: fromAddress(), to: teamList(),
    subject: `Nova inscrição confirmada na newsletter — ${email}`,
    text: `Nova inscrição confirmada na newsletter da CTB Finances.\n\nE-mail: ${email}\nIdioma: ${d.l === 'en' ? 'EN' : 'PT'}\nConfirmado em: ${when}\nSalvo em Resend › Contatos: ${saved ? 'sim' : 'NÃO — verifique se a RESEND_API_KEY tem permissão Full access'}`,
    html: brandedHtml('pt', 'Nova inscrição na newsletter', [`E-mail: <b>${escapeHtml(email)}</b>`, `Idioma: ${d.l === 'en' ? 'EN' : 'PT'}`, `Confirmado em: ${when}`, `Salvo em Resend › Contatos: ${saved ? 'sim' : 'NÃO — verifique se a RESEND_API_KEY tem permissão Full access'}`]),
  }, 'aviso de nova inscrição');
  // 3) boas-vindas com link para cancelar a inscrição
  const en = d.l === 'en';
  const unsub = `${SITE}/api/newsletter/unsubscribe?t=${signToken(email, d.l, 'u')}`;
  const title = en ? 'Welcome to the CTB Finances newsletter' : 'Boas-vindas à newsletter da CTB Finances';
  const ps = en
    ? ['Your subscription has been confirmed. You will receive institutional content and updates from CTB Finances.', `If you no longer wish to receive our emails, you can <a href="${unsub}" style="color:#9B6448">unsubscribe at any time</a>.`]
    : ['Sua inscrição foi confirmada. Você passará a receber conteúdos e novidades institucionais da CTB Finances.', `Se não quiser mais receber nossos e-mails, você pode <a href="${unsub}" style="color:#9B6448">cancelar a inscrição a qualquer momento</a>.`];
  await sendEmail({
    from: fromAddress(), to: [email], reply_to: replyToTeam(),
    subject: `${title}`,
    html: brandedHtml(d.l, title, ps),
    text: [title, '', ps[0], '', (en ? 'Unsubscribe: ' : 'Cancelar inscrição: ') + unsub].join('\n'),
    headers: { 'List-Unsubscribe': `<${unsub}>` },
  }, 'boas-vindas da newsletter');
  return page(d.l, 'ok');
}

/** Cria o contato; se já existir (inscrição duplicada), atualiza o status. Retorna true se ficou gravado. */
async function upsertContact(email, unsubscribed) {
  if (process.env.CONTACT_DRY_RUN === '1' && !process.env.RESEND_API_BASE) { console.log(`[contatos] DRY_RUN — ${unsubscribed ? 'cancelamento' : 'inscrição'} validado`); return true; }
  const headers = { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
  try {
    if (!unsubscribed) {
      const body = { email, unsubscribed: false };
      if (process.env.RESEND_SEGMENT_ID) body.segments = [{ id: process.env.RESEND_SEGMENT_ID }];
      const c = await fetch(`${RESEND_API}/contacts`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      if (c.ok) { console.log('[contatos] contato criado'); return true; }
      if (c.status === 401 || c.status === 403) { console.error('[contatos] chave sem permissão para contatos (precisa Full access)'); return false; }
      console.log('[contatos] criação respondeu', c.status, '— tentando atualizar contato existente');
    }
    const u = await fetch(`${RESEND_API}/contacts/${encodeURIComponent(email)}`, { method: 'PATCH', headers, body: JSON.stringify({ unsubscribed }), signal: AbortSignal.timeout(15000) });
    if (u.ok) { console.log(`[contatos] contato ${unsubscribed ? 'descadastrado' : 'reativado'}`); return true; }
    console.error('[contatos] atualização respondeu', u.status);
    return false;
  } catch {
    console.error('[contatos] falha de rede');
    return false;
  }
}

async function handleNewsletterUnsubscribe(url, res) {
  const d = newsletterReady() ? readToken(url.searchParams.get('t')) : null;
  const go = (lang, status) => { res.writeHead(303, { Location: `${lang === 'en' ? '/en/newsletter/' : '/newsletter/'}?status=${status}`, 'Cache-Control': 'no-store' }); res.end(); };
  if (!d || d.p !== 'u' || !EMAIL_RE.test(String(d.e))) return go(d?.l || 'pt', 'error');
  const email = String(d.e).toLowerCase();
  const saved = await upsertContact(email, true);
  await sendEmail({
    from: fromAddress(), to: teamList(),
    subject: `Inscrição cancelada na newsletter — ${email}`,
    text: `Um inscrito cancelou a newsletter da CTB Finances.\n\nE-mail: ${email}\nAtualizado em Resend › Contatos: ${saved ? 'sim' : 'NÃO — atualize manualmente'}`,
    html: brandedHtml('pt', 'Inscrição cancelada na newsletter', [`E-mail: <b>${escapeHtml(email)}</b>`, `Atualizado em Resend › Contatos: ${saved ? 'sim' : 'NÃO — atualize manualmente'}`]),
  }, 'aviso de cancelamento');
  return go(d.l, 'unsubscribed');
}

// Área do Cliente: liga só com DATABASE_URL + ARQUIVOS_DIR configurados no Railway
let areaCliente = null;
try { areaCliente = await iniciarAreaCliente({ origens: ALLOWED_ORIGINS }); }
catch (e) { console.error('[area-cliente] não iniciou:', e.message); }

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' }); return void res.end('Bad Request'); }
  if (url.pathname.startsWith('/api/cliente/')) {
    if (!areaCliente) return sendJson(res, url.pathname === '/api/cliente/status' ? 200 : 503, url.pathname === '/api/cliente/status' ? { ativo: false } : { erro: 'indisponivel' });
    return void areaCliente.tratar(req, res, url);
  }
  if (url.pathname === '/api/newsletter') {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { ok: false, error: 'method' }); }
    return void handleNewsletter(req, res);
  }
  if (url.pathname === '/api/newsletter/confirm') return void handleNewsletterConfirm(url, res);
  if (url.pathname === '/api/newsletter/unsubscribe') return void handleNewsletterUnsubscribe(url, res);
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
