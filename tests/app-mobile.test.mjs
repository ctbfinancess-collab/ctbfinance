// Testes do LOGIN DO APP (token no cabeçalho Authorization: Bearer): isolamento web×app, CSRF, revogação e limites.
// + Resend falso (com atraso configurável). Dados fictícios. Asserções do comportamento ESPERADO.
// IP do visitante: o proxy do Railway SUBSTITUI X-Real-IP pelo IP real; o teste simula isso enviando X-Real-IP.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const livre = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-app-'));
const ARQ = path.join(TMP, 'volume');
const [PG, PORTA, MOCK] = [await livre(), await livre(), await livre()];
const epg = new EmbeddedPostgres({ databaseDir: path.join(TMP, 'pg'), user: 'ctb', password: 'teste-local', port: PG, persistent: false, onLog: () => {} });
await epg.initialise(); await epg.start(); await epg.createDatabase('ctb_area');
const DATABASE_URL = `postgres://ctb:teste-local@127.0.0.1:${PG}/ctb_area`;
const emails = []; let atrasoResend = 0;
const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', async () => { await sleep(atrasoResend); try { emails.push(JSON.parse(b)); } catch {} res.end('{"id":"x"}'); }); });
await new Promise((ok) => mock.listen(MOCK, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${PORTA}`;
Object.assign(process.env, { DATABASE_URL, ARQUIVOS_DIR: ARQ, RESEND_API_KEY: 'teste', RESEND_API_BASE: `http://127.0.0.1:${MOCK}`, CONTACT_EMAIL_TO: 'equipe@exemplo.invalid', AREA_COOKIE_INSEGURO: '1', AREA_SITE_URL: BASE });
let srv, logSrv = '';
async function subir() {
  logSrv = '';
  srv = spawn(process.execPath, ['server.mjs'], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA) }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', (d) => (logSrv += d)); srv.stderr.on('data', (d) => (logSrv += d));
  for (let i = 0; i < 100 && !/porta/.test(logSrv); i++) await sleep(100);
}
const vivo = async () => { if (srv.exitCode !== null) return false; try { return (await fetch(BASE + '/api/cliente/status')).status === 200; } catch { return false; } };
await subir();
const { criarBanco, criarArquivos } = await import('../server/area/nucleo.mjs');
const { criarApi } = await import('../server/area/api.mjs');
const { criarAdmin } = await import('../server/area/admin.mjs');
const { enviarEmailAcesso } = await import('../server/area/emails.mjs');
const db = criarBanco(DATABASE_URL); const arquivos = criarArquivos(ARQ);
const adm = criarAdmin({ db, arquivos, api: criarApi({ db, arquivos, origens: new Set(), enviarEmail: enviarEmailAcesso, siteUrl: BASE }) });
db.pool.on('error', () => {});
const tok = (to) => { const e = [...emails].reverse().find((m) => m.to.includes(to)); return (e.text.match(/[?&](?:convite|redefinir)=([A-Za-z0-9_-]+)/) || [])[1]; };
const req = async (metodo, rota, { json, corpo, headers = {}, cookie } = {}) => {
  const h = { Origin: BASE, ...headers }; if (cookie) h.Cookie = cookie;
  if (json !== undefined) { h['Content-Type'] = 'application/json'; corpo = JSON.stringify(json); }
  const r = await fetch(BASE + rota, { method: metodo, headers: h, body: corpo });
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, dados: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), h: r.headers, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
};
async function contaComSenha(email, senha) { await adm.convidar(email); const r = await req('POST', '/api/cliente/redefinir', { json: { token: tok(email), senha } }); if (r.status !== 200) throw new Error('senha não definida: ' + JSON.stringify(r.dados)); return r.cookie; }
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
let ok = 0, falhas = 0;
async function t(id, desc, fn) { try { const r = await fn(); if (r !== true) throw new Error('condição não atendida' + (r && r !== false ? ' ' + JSON.stringify(r).slice(0, 220) : '')); ok++; console.log(`✅ ${id} ${desc}`); } catch (e) { falhas++; console.log(`❌ ${id} ${desc} → ${String(e.message).slice(0, 240)}`); } }
const reiniciarSeCaiu = async () => { if (!(await vivo())) { console.log('   (servidor tinha caído — reiniciado para continuar)'); await subir(); } };

const { hashToken: require_hash } = await import('../server/area/nucleo.mjs');
const hojeDubai = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
const dias = (n) => { const d = new Date(hojeDubai() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// requisição "de app": sem Origin e sem cookie; token no cabeçalho
const app = async (metodo, rota, { token, json, corpo, headers = {} } = {}) => {
  const h = { ...headers }; if (token) h.Authorization = `Bearer ${token}`;
  if (json !== undefined) { h['Content-Type'] = 'application/json'; corpo = JSON.stringify(json); }
  const r = await fetch(BASE + rota, { method: metodo, headers: h, body: corpo });
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, dados: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), h: r.headers };
};

try {
  await contaComSenha('cliente@example.com', 'SenhaSegura2026');
  await contaComSenha('equipe@example.com', 'SenhaSegura2026'); await adm.concederEquipe('equipe@example.com');
  const cWeb = (await req('POST', '/api/cliente/entrar', { json: { email: 'cliente@example.com', senha: 'SenhaSegura2026' } })).cookie;

  console.log('--- Login do app');
  const l1 = await app('POST', '/api/cliente/app/entrar', { json: { email: 'cliente@example.com', senha: 'SenhaSegura2026', dispositivo: 'iPhone de teste <script>' } });
  const tok = l1.dados.token;
  await t('AP1', 'Login do app (sem Origin, sem cookie) → 200 com token no corpo e SEM cookie', async () => l1.status === 200 && /^[A-Za-z0-9_-]{40,}$/.test(tok) && !l1.h.get('set-cookie') && l1.dados.expiraEmSegundos === 43200);
  const dbSess = (await db.q(`select tipo, dispositivo, id_hash from sessoes where tipo='app'`)).rows[0];
  await t('AP2', 'Banco guarda só o HASH do token, tipo "app" e o aparelho sem caracteres perigosos', async () => dbSess.tipo === 'app' && dbSess.id_hash !== tok && !dbSess.dispositivo.includes('<'));
  await t('AP3', 'Token do app lê sessão e perfil sem Origin', async () => (await app('GET', '/api/cliente/sessao', { token: tok })).dados.email === 'cliente@example.com' && (await app('GET', '/api/cliente/perfil', { token: tok })).status === 200);
  await t('AP4', 'Token do app altera o perfil (PUT) sem Origin', async () => (await app('PUT', '/api/cliente/perfil', { token: tok, json: { city: 'Dubai' } })).status === 200);
  const up = await app('POST', '/api/cliente/documentos', { token: tok, corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'pelo-app.pdf' } });
  const dl = await app('GET', `/api/cliente/documentos/${up.dados.documento?.id}/arquivo`, { token: tok });
  await t('AP5', 'Envio e download de documento pelo app', async () => up.status === 201 && dl.status === 200 && Buffer.from(dl.dados).equals(PDF));
  await t('AP6', 'Pedido de agendamento pelo app', async () => (await app('POST', '/api/cliente/agendamentos', { token: tok, json: { assunto: 'investimentos', data: dias(3), formato: 'telefone', periodo: 'manha' } })).status === 201);

  console.log('--- Isolamento web × app');
  await t('AP7', 'Token do app usado como COOKIE → 401 (não vale no navegador)', async () => (await req('GET', '/api/cliente/sessao', { cookie: `ctb_sessao=${tok}` })).status === 401);
  const cookieValor = cWeb.split('=')[1];
  await t('AP8', 'Cookie do navegador usado como TOKEN do app → 401', async () => (await app('GET', '/api/cliente/sessao', { token: cookieValor })).status === 401);
  await t('AP9', 'Cabeçalho Authorization malformado + cookie válido → 401 (não cai no cookie)', async () => (await fetch(BASE + '/api/cliente/sessao', { headers: { Authorization: 'Bearer x', Cookie: cWeb } })).status === 401);
  const lEq = await app('POST', '/api/cliente/app/entrar', { json: { email: 'equipe@example.com', senha: 'SenhaSegura2026' } });
  await t('AP10', 'Conta da equipe entrando pelo app NÃO acessa o Admin (404); pelo navegador continua acessando', async () => lEq.status === 200 && (await app('GET', '/api/cliente/equipe/resumo', { token: lEq.dados.token })).status === 404 && (await req('GET', '/api/cliente/equipe/resumo', { cookie: (await req('POST', '/api/cliente/entrar', { json: { email: 'equipe@example.com', senha: 'SenhaSegura2026' } })).cookie })).status === 200);

  console.log('--- Proteção contra outros sites (CSRF)');
  await t('AP11', 'Navegador: cookie SEM Origin em alteração → 403', async () => (await fetch(BASE + '/api/cliente/perfil', { method: 'PUT', headers: { Cookie: cWeb, 'Content-Type': 'application/json' }, body: '{"city":"X"}' })).status === 403);
  await t('AP12', 'Origin de outro site → 403 mesmo com token do app', async () => (await app('PUT', '/api/cliente/perfil', { token: tok, json: { city: 'X' }, headers: { Origin: 'https://evil.example' } })).status === 403);
  await t('AP13', '"Esqueci a senha" pelo app (/app/esqueci, sem Origin) → 200; a rota do navegador sem Origin → 403', async () => (await app('POST', '/api/cliente/app/esqueci', { json: { email: 'cliente@example.com', lang: 'pt' } })).status === 200 && (await app('POST', '/api/cliente/esqueci', { json: { email: 'cliente@example.com', lang: 'pt' } })).status === 403);
  console.log('--- Correções da revisão independente');
  const doc = up.dados.documento;
  const tokEq = lEq.dados.token;
  await t('AP20', 'Conta da equipe pelo APP não baixa documento de outro cliente (404) e a sessão diz equipe:false', async () => (await app('GET', `/api/cliente/documentos/${doc.id}/arquivo`, { token: tokEq })).status === 404 && (await app('GET', '/api/cliente/sessao', { token: tokEq })).dados.equipe === false);
  const semOrigin = await fetch(BASE + '/api/cliente/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'cliente@example.com', senha: 'SenhaSegura2026' }) });
  const textoPuro = await fetch(BASE + '/api/cliente/app/entrar', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ email: 'cliente@example.com', senha: 'SenhaSegura2026' }) });
  await t('AP21', `Login do NAVEGADOR sem Origin → 403 (sem cookie); corpo text/plain → 415 (${semOrigin.status}, ${textoPuro.status})`, async () => semOrigin.status === 403 && !semOrigin.headers.get('set-cookie') && textoPuro.status === 415);
  await t('AP22', 'Cookie válido + "Authorization: Basic" (proxy/homologação) → sessão do navegador continua valendo', async () => (await fetch(BASE + '/api/cliente/sessao', { headers: { Cookie: cWeb, Authorization: 'Basic dXNlcjpzZW5oYQ==' } })).status === 200);
  await t('AP23', 'App com token "bearer" minúsculo + cookie qualquer, sem Origin → aceito', async () => (await fetch(BASE + '/api/cliente/perfil', { method: 'PUT', headers: { Authorization: `bearer ${tok}`, Cookie: '__cf_bm=abc', 'Content-Type': 'application/json' }, body: '{"city":"Abu Dhabi"}' })).status === 200);
  const lUni = await app('POST', '/api/cliente/app/entrar', { json: { email: 'cliente@example.com', senha: 'SenhaSegura2026', dispositivo: 'iPhone de João' } });
  await t('AP24', 'Nome do aparelho com acento é preservado', async () => lUni.status === 200 && (await db.q(`select dispositivo from sessoes where tipo='app' order by criada_em desc limit 1`)).rows[0].dispositivo === 'iPhone de João');

  console.log('--- Limites, bloqueio, expiração e saída');
  await db.q('delete from tentativas_login');
  const tent = []; for (let i = 0; i < 6; i++) tent.push((await app('POST', '/api/cliente/app/entrar', { json: { email: 'cliente@example.com', senha: 'errada' + i + 'xyz' }, headers: { 'X-Real-IP': '203.0.113.77' } })).status);
  await t('AP14', `Senha errada pelo app → 401 e o 6º erro → 429, como no site (${tent})`, async () => tent.slice(0, 5).every((s) => s === 401) && tent[5] === 429);
  await adm.bloquear('cliente@example.com');
  await t('AP15', 'Cliente bloqueado pela equipe → token do app para de valer na hora', async () => (await app('GET', '/api/cliente/sessao', { token: tok })).status === 401);
  await adm.desbloquear('cliente@example.com');
  await db.q('delete from tentativas_login');
  const tok2 = (await app('POST', '/api/cliente/app/entrar', { json: { email: 'cliente@example.com', senha: 'SenhaSegura2026' } })).dados.token;
  await db.q(`update sessoes set ultimo_uso_em = now() - interval '3 hours' where id_hash = $1`, [require_hash(tok2)]);
  await t('AP16', 'Token parado há mais de 2 h → 401', async () => (await app('GET', '/api/cliente/sessao', { token: tok2 })).status === 401);
  const tok3 = (await app('POST', '/api/cliente/app/entrar', { json: { email: 'cliente@example.com', senha: 'SenhaSegura2026' } })).dados.token;
  const saiu = await app('POST', '/api/cliente/app/sair', { token: tok3 });
  await t('AP17', 'Sair pelo app → token revogado (401) e nenhuma ordem de apagar cookie', async () => saiu.status === 200 && !saiu.h.get('set-cookie') && (await app('GET', '/api/cliente/sessao', { token: tok3 })).status === 401);
  await t('AP18', 'Bloqueio derrubou também a sessão do navegador (todas as sessões da cliente)', async () => (await req('GET', '/api/cliente/sessao', { cookie: cWeb })).status === 401);
  const cWeb2 = (await req('POST', '/api/cliente/entrar', { json: { email: 'cliente@example.com', senha: 'SenhaSegura2026' } })).cookie;
  await t('AP19', 'Sair pelo app não afeta uma sessão nova do navegador', async () => (await req('GET', '/api/cliente/sessao', { cookie: cWeb2 })).status === 200);
} catch (e) {
  falhas++; console.log('❌ erro inesperado:', e);
} finally {
  console.log(`\nRESULTADO LOGIN DO APP: ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  srv.kill(); mock.close(); await db.fechar().catch(() => {}); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
