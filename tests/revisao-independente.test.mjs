// Testes FOCAIS dos achados da revisão independente (V1–V11). Servidor real + Postgres REAL + volume temporário
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
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-rev-'));
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

try {
  console.log('--- V1 Queda de conexão do Postgres não derruba o site');
  const c1 = await contaComSenha('v1@example.com', 'SenhaSegura2026');
  await req('GET', '/api/cliente/perfil', { cookie: c1 });
  await db.q(`select pg_terminate_backend(pid) from pg_stat_activity where datname='ctb_area' and pid <> pg_backend_pid()`);
  await sleep(800);
  await t('V1-1', 'Após o banco encerrar as conexões, o servidor continua de pé', async () => srv.exitCode === null);
  await t('V1-2', 'E volta a atender a Área do Cliente (reconecta)', async () => (await vivo()) && (await req('GET', '/api/cliente/perfil', { cookie: c1 })).status === 200);
  await t('V1-3', 'Páginas do site seguem no ar', async () => (await fetch(BASE + '/')).status === 200);
  await reiniciarSeCaiu();

  console.log('--- V2 Endereço malformado não derruba o servidor');
  const bruto = await new Promise((ok) => { const s = net.connect(PORTA, '127.0.0.1', () => s.write('GET //[ HTTP/1.1\r\nHost: x\r\n\r\n')); let b = ''; s.on('data', (d) => (b += d)); s.on('close', () => ok(b)); s.on('error', () => ok(b)); setTimeout(() => s.destroy(), 1500); });
  await sleep(300);
  await t('V2-1', `Requisição "GET //[" → resposta 400 (${bruto.split('\r\n')[0] || 'sem resposta'})`, async () => /^HTTP\/1\.1 400/.test(bruto));
  await t('V2-2', 'Servidor continua de pé e atendendo', async () => vivo());
  await reiniciarSeCaiu();

  console.log('--- V3/V4 Limites de login: sem bloqueio por terceiros, sem burla por cabeçalho forjado');
  await db.q('delete from tentativas_login');
  await contaComSenha('v3@example.com', 'SenhaSegura2026');
  for (let i = 0; i < 5; i++) await req('POST', '/api/cliente/entrar', { json: { email: 'v3@example.com', senha: 'errada' + i + 'x9' }, headers: { 'X-Real-IP': `203.0.113.${10 + i}` } });
  const legitimo = await req('POST', '/api/cliente/entrar', { json: { email: 'v3@example.com', senha: 'SenhaSegura2026' }, headers: { 'X-Real-IP': '198.51.100.7' } });
  await t('V3-1', `Terceiro erra 5× (de outros IPs): o cliente ainda entra do IP dele (${legitimo.status})`, async () => legitimo.status === 200);
  await db.q('delete from tentativas_login');
  const mesmoIp = []; for (let i = 0; i < 6; i++) mesmoIp.push((await req('POST', '/api/cliente/entrar', { json: { email: 'v3@example.com', senha: 'errada' + i + 'y9' }, headers: { 'X-Real-IP': '203.0.113.50' } })).status);
  await t('V3-2', `Preservado: do MESMO IP, 5 erros e a 6ª limitada (${mesmoIp.join(',')})`, async () => mesmoIp.slice(0, 5).every((s) => s === 401) && mesmoIp[5] === 429);
  await db.q('delete from tentativas_login');
  const lote = await Promise.all(Array.from({ length: 12 }, (_, i) => req('POST', '/api/cliente/entrar', { json: { email: 'v3@example.com', senha: 'paralela' + i + 'z9' }, headers: { 'X-Real-IP': '203.0.113.60' } }).then((r) => r.status)));
  await t('V3-3', `Preservado (R2): 12 paralelas do mesmo IP → no máximo 5 verificadas (401=${lote.filter((s) => s === 401).length})`, async () => lote.filter((s) => s === 401).length <= 5);
  await db.q('delete from tentativas_login');
  const espalhado = []; for (let i = 0; i < 40; i++) espalhado.push((await req('POST', '/api/cliente/entrar', { json: { email: `alvo${i}@example.com`, senha: 'qualquer123x' }, headers: { 'X-Real-IP': '203.0.113.99', 'X-Forwarded-For': `10.0.${i}.1` } })).status);
  await t('V4-1', `40 tentativas do MESMO IP real com X-Forwarded-For forjado variável → limite por IP aplicado (429=${espalhado.filter((s) => s === 429).length})`, async () => espalhado.filter((s) => s === 429).length >= 10);
  await db.q('delete from tentativas_login');
  const distribuido = []; for (let i = 0; i < 35; i++) distribuido.push((await req('POST', '/api/cliente/entrar', { json: { email: 'v3@example.com', senha: 'dist' + i + 'q9' }, headers: { 'X-Real-IP': `192.0.2.${i + 1}` } })).status);
  await t('V4-2', `Ataque distribuído (35 IPs, mesma conta) → teto por conta ainda limita (429=${distribuido.filter((s) => s === 429).length})`, async () => distribuido.filter((s) => s === 429).length >= 5);
  const doIpConhecido = await req('POST', '/api/cliente/entrar', { json: { email: 'v3@example.com', senha: 'SenhaSegura2026' }, headers: { 'X-Real-IP': '198.51.100.7' } });
  const deIpNovo = await req('POST', '/api/cliente/entrar', { json: { email: 'v3@example.com', senha: 'SenhaSegura2026' }, headers: { 'X-Real-IP': '198.51.100.250' } });
  await t('V3-4', `Sob ataque distribuído (teto geral atingido): o cliente ENTRA do IP onde já entrou antes (${doIpConhecido.status}); de um IP novo continua limitado (${deIpNovo.status})`, async () => doIpConhecido.status === 200 && deIpNovo.status === 429);
  await t('V4-3', 'Limpeza: tentativas e sessões antigas são apagadas', async () => {
    await db.q(`insert into tentativas_login(chave, em) values ('antiga', now() - interval '3 days')`);
    const { limparRegistrosAntigos } = await import('../server/area/api.mjs');
    if (typeof limparRegistrosAntigos !== 'function') return false;
    await limparRegistrosAntigos(db);
    return (await db.q(`select count(*)::int n from tentativas_login where chave='antiga'`)).rows[0].n === 0;
  });

  console.log('--- V5 "Esqueci a senha" não revela pela demora se a conta existe');
  await db.q('delete from tentativas_login');
  atrasoResend = 400;
  const tempo = async (email, ip) => { const t0 = Date.now(); await req('POST', '/api/cliente/esqueci', { json: { email }, headers: { 'X-Real-IP': ip } }); return Date.now() - t0; };
  const tExiste = await tempo('v1@example.com', '203.0.113.71'), tNao = await tempo('naoexiste-v5@example.com', '203.0.113.72');
  await sleep(600); atrasoResend = 0;
  await t('V5-1', `Tempo de resposta parecido (existe ${tExiste} ms × não existe ${tNao} ms)`, async () => Math.abs(tExiste - tNao) < 150);
  await t('V5-2', 'O e-mail continua sendo enviado para a conta existente', async () => emails.some((m) => m.to.includes('v1@example.com') && /Redefinir/.test(m.subject)));

  console.log('--- V6 docs:baixar não usa o nome escolhido pelo cliente');
  const c6 = await contaComSenha('v6@example.com', 'SenhaSegura2026');
  const d6 = (await req('POST', '/api/cliente/documentos', { corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'server.mjs' }, cookie: c6 })).dados.documento;
  const pasta = fs.mkdtempSync(path.join(TMP, 'baixar-')); fs.writeFileSync(path.join(pasta, 'server.mjs'), 'ORIGINAL');
  let r6; try { r6 = await adm.baixarDocumento(d6.id, pasta); } catch (e) { r6 = { erro: e.message }; }
  await t('V6-1', `Arquivo de app com o mesmo nome NÃO é sobrescrito (salvo como ${r6.salvo ? path.basename(r6.salvo) : JSON.stringify(r6)})`, async () => fs.readFileSync(path.join(pasta, 'server.mjs'), 'utf8') === 'ORIGINAL' && Boolean(r6.salvo) && path.basename(r6.salvo) !== 'server.mjs');
  let r6b; try { r6b = await adm.baixarDocumento(d6.id, pasta); } catch (e) { r6b = { erro: e.message }; }
  await t('V6-2', 'Baixar de novo para a mesma pasta não sobrescreve (recusa)', async () => Boolean(r6b.erro));

  console.log('--- V7 Cota de envios por cliente');
  const c7 = await contaComSenha('v7@example.com', 'SenhaSegura2026');
  const st = []; for (let i = 0; i < 31; i++) st.push((await req('POST', '/api/cliente/documentos', { corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': `d${i}.pdf` }, cookie: c7 })).status);
  await t('V7-1', `31 envios no dia: os 30 primeiros aceitos e o 31º recusado (último=${st[30]})`, async () => st.slice(0, 30).every((s) => s === 201) && st[30] === 429);
  await t('V7-2', 'Outro cliente não é afetado pela cota alheia', async () => (await req('POST', '/api/cliente/documentos', { corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'x.pdf' }, cookie: c6 })).status === 201);
  const c7b = await contaComSenha('v7b@example.com', 'SenhaSegura2026');
  for (let i = 0; i < 30; i++) await req('POST', '/api/cliente/documentos', { corpo: Buffer.from('ABC'), headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': `ruim${i}.pdf` }, cookie: c7b });
  await t('V7-3', '30 arquivos RECUSADOS não consomem a cota de disco: um PDF válido ainda é aceito', async () => (await req('POST', '/api/cliente/documentos', { corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'bom.pdf' }, cookie: c7b })).status === 201);
  const c7c = await contaComSenha('v7c@example.com', 'SenhaSegura2026');
  const grande = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(9 * 1024 * 1024, 0x20), Buffer.from('\n%%EOF\n')]);
  const par = await Promise.all(Array.from({ length: 8 }, (_, i) => req('POST', '/api/cliente/documentos', { corpo: grande, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': `g${i}.pdf` }, cookie: c7c }).then((r) => r.status).catch(() => 'erro')));
  await t('V7-4', `8 envios grandes SIMULTÂNEOS: parte recusada por excesso de envios em andamento (${par.join(',')}); nada sobra no temporário`, async () => par.filter((x) => x === 429).length >= 1 && par.filter((x) => x === 201).length >= 3 && fs.readdirSync(path.join(ARQ, 'tmp')).length === 0);

  console.log('--- V8 Perfil: nomes herdados do JavaScript');
  const r8 = await req('PUT', '/api/cliente/perfil', { json: { toString: 'A'.repeat(15000) }, cookie: c6 });
  await t('V8-1', `"toString" é recusado (${r8.status}) e nada é gravado`, async () => r8.status === 400 && !(await db.q(`select dados ? 'toString' as tem from perfis p join usuarios u on u.id=p.usuario_id where u.email='v6@example.com'`)).rows[0]?.tem);
  await t('V8-2', '"constructor" e "__proto__" também recusados', async () => (await req('PUT', '/api/cliente/perfil', { json: { constructor: 'x' }, cookie: c6 })).status === 400 && (await req('PUT', '/api/cliente/perfil', { corpo: '{"__proto__":{"city":"x"}}', headers: { 'Content-Type': 'application/json' }, cookie: c6 })).status === 400);

  console.log('--- V9 Cabeçalhos de segurança nas páginas');
  const h9 = (await fetch(BASE + '/area-do-cliente/')).headers;
  await t('V9-1', 'HSTS presente', async () => /max-age=\d+/.test(h9.get('strict-transport-security') || ''));
  await t('V9-2', 'CSP com frame-ancestors, base-uri e object-src', async () => /frame-ancestors 'self'/.test(h9.get('content-security-policy') || '') && /base-uri 'self'/.test(h9.get('content-security-policy') || '') && /object-src 'none'/.test(h9.get('content-security-policy') || ''));
  await t('V9-3', 'Permissions-Policy presente', async () => /camera=\(\)/.test(h9.get('permissions-policy') || ''));
  await t('V9-4', 'Respostas da API também com HSTS e CSP restritiva', async () => { const h = (await fetch(BASE + '/api/cliente/status')).headers; return /max-age/.test(h.get('strict-transport-security') || '') && /default-src 'none'/.test(h.get('content-security-policy') || ''); });
  await t('V9-5', 'Download também com HSTS e CSP restritiva', async () => { const h = (await req('GET', `/api/cliente/documentos/${d6.id}/arquivo`, { cookie: c6 })).h; return /max-age/.test(h.get('strict-transport-security') || '') && /default-src 'none'/.test(h.get('content-security-policy') || '') && /no-store/.test(h.get('cache-control') || ''); });
  await t('V4-4', 'Diagnóstico de IP DESLIGADO por padrão (status não revela cabeçalhos)', async () => JSON.stringify((await req('GET', '/api/cliente/status')).dados) === '{"ativo":true}');

  console.log('--- V10/V11 Limites de tamanho: resposta chega e a conexão não fica aberta');
  let r10; try { r10 = await req('POST', '/api/cliente/entrar', { corpo: JSON.stringify({ email: 'x@example.com', senha: 'x'.repeat(30000) }), headers: { 'Content-Type': 'application/json' } }); } catch (e) { r10 = { status: 'conexão cortada: ' + e.message }; }
  await t('V10-1', `JSON grande demais → o navegador recebe 413 (${r10.status})`, async () => r10.status === 413);
  const c11 = c6;
  const t0 = Date.now();
  const r11 = await new Promise((ok) => {
    const s = net.connect(PORTA, '127.0.0.1', () => {
      s.write(`POST /api/cliente/documentos HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: ${BASE}\r\nCookie: ${c11}\r\nContent-Type: application/pdf\r\nX-Nome-Arquivo: grande.pdf\r\nTransfer-Encoding: chunked\r\n\r\n`);
      const bloco = Buffer.alloc(1024 * 1024, 0x20); let n = 0; let resp = '';
      s.on('data', (d) => (resp += d));
      const enviar = () => { if (s.destroyed) return; if (n++ < 40) { s.write(bloco.length.toString(16) + '\r\n'); s.write(bloco); s.write('\r\n'); setTimeout(enviar, 20); } };
      s.on('close', () => ok({ resp, ms: Date.now() - t0, enviadosMB: n }));
      s.on('error', () => {});
      enviar(); setTimeout(() => s.destroy(), 8000);
    });
  });
  await t('V11-1', `Envio sem tamanho declarado acima de 10 MB: 413 e conexão fechada cedo (enviou ~${r11.enviadosMB} MB, ${r11.ms} ms)`, async () => /^HTTP\/1\.1 413/.test(r11.resp) && r11.enviadosMB < 30);
  await t('V11-2', 'Servidor de pé e sem temporários sobrando', async () => (await vivo()) && fs.readdirSync(path.join(ARQ, 'tmp')).length === 0);
} finally {
  console.log(`\nRESULTADO REVISÃO INDEPENDENTE (V1–V11): ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  if (srv.exitCode !== null) console.log(`(servidor ENCERRADO, código ${srv.exitCode}):\n${logSrv.slice(-800)}`);
  srv.kill(); mock.close(); await db.fechar().catch(() => {}); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
}
// encerra explicitamente: a biblioteca do Postgres de teste (async-exit-hook) sobrescreveria o código de saída
process.exit(falhas ? 1 : 0);
