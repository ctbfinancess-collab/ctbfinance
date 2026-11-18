// Testes das OPERAÇÕES solicitadas pelo cliente (transferência/câmbio): nada é executado sozinho; a equipe analisa,
// conclui/recusa e lança no extrato uma única vez. Isolamento, validação, limites, aviso à equipe.
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
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-op-'));
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
  const cChefe = await contaComSenha('chefe@example.com', 'SenhaSegura2026'); await adm.concederEquipe('chefe@example.com');
  const cAna = await contaComSenha('ana@example.com', 'SenhaSegura2026');
  const cBia = await contaComSenha('bia@example.com', 'SenhaSegura2026');
  const ana = (await db.q(`select id from usuarios where email='ana@example.com'`)).rows[0].id;
  const bia = (await db.q(`select id from usuarios where email='bia@example.com'`)).rows[0].id;
  const E = (m, r, o = {}) => req(m, '/api/cliente/equipe' + r, { ...o, cookie: cChefe });
  const P = (cookie, json) => req('POST', '/api/cliente/operacoes', { cookie, json });
  const L = async (cookie) => (await req('GET', '/api/cliente/operacoes', { cookie })).dados.operacoes;
  const saldo = async (id) => (await db.q('select saldo_centavos::text s from contas_cliente where id=$1', [id])).rows[0].s;
  const aed = (await E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'digital', moeda: 'AED', saldo: '28.750,00' } })).dados.id;
  const usd = (await E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'global', moeda: 'USD', saldo: '10000' } })).dados.id;
  const contaBia = (await E('PUT', `/clientes/${bia}/contas`, { json: { tipo: 'digital', moeda: 'AED', saldo: '10' } })).dados.id;
  const BEN = { nome: 'Maria <b>Silva</b>', banco: 'Banco Exemplo', iban: 'ae07 0331 2345 6789 0123 456', swift: 'bomlaead', pais: 'Emirados' };

  console.log('--- Cliente solicita');
  await t('OP1', 'Sem solicitações → lista vazia; sem sessão → 401', async () => (await L(cAna)).length === 0 && (await req('GET', '/api/cliente/operacoes')).status === 401);
  const n0 = emails.length;
  const s1 = await P(cAna, { tipo: 'transferencia_swift', contaId: aed, valor: '8.000,00', beneficiario: BEN, observacao: 'Pagamento escola' });
  await t('OP2', 'Transferência SWIFT registrada como "recebida"; moeda vem da conta', async () => { const l = await L(cAna); return s1.status === 201 && l.length === 1 && l[0].status === 'recebida' && l[0].moeda === 'AED' && l[0].valor === '800000' && l[0].beneficiario.iban === 'AE07 0331 2345 6789 0123 456' && l[0].beneficiario.swift === 'BOMLAEAD'; });
  await t('OP3', 'NADA é executado: saldo e extrato continuam iguais', async () => (await saldo(aed)) === '2875000' && (await db.q('select count(*)::int n from movimentos_cliente')).rows[0].n === 0);
  await sleep(500);
  await t('OP4', 'Equipe recebe e-mail com os dados (texto escapado)', async () => { const m = emails.slice(n0).find((x) => /Solicitação de operação/.test(x.subject)); return !!m && m.to.includes('equipe@exemplo.invalid') && m.html.includes('BOMLAEAD') && m.html.includes('Maria &lt;b&gt;Silva') && !m.html.includes('<b>Silva'); });
  const s2 = await P(cAna, { tipo: 'cambio', contaId: aed, valor: '50.000', moedaDestino: 'USD' });
  await t('OP5', 'Câmbio AED → USD com "50.000" (milhar)', async () => s2.status === 201 && (await L(cAna)).some((o) => o.tipo === 'cambio' && o.valor === '5000000' && o.moeda_destino === 'USD'));
  const ruins = await Promise.all([
    P(cAna, { tipo: 'pix', contaId: aed, valor: '1' }),
    P(cAna, { tipo: 'cambio', contaId: aed, valor: '1', moedaDestino: 'AED' }),
    P(cAna, { tipo: 'cambio', contaId: aed, valor: '0', moedaDestino: 'USD' }),
    P(cAna, { tipo: 'cambio', contaId: aed, valor: '-5', moedaDestino: 'USD' }),
    P(cAna, { tipo: 'transferencia_local', contaId: aed, valor: '10', beneficiario: { nome: '', iban: 'AE07' } }),
    P(cAna, { tipo: 'transferencia_local', contaId: aed, valor: '10', beneficiario: { nome: 'X' } }),
    P(cAna, { tipo: 'transferencia_swift', contaId: aed, valor: '10', beneficiario: { nome: 'X', iban: 'AE07', swift: '12' } }),
    P(cAna, { tipo: 'cambio', contaId: contaBia, valor: '10', moedaDestino: 'USD' }),
    P(cAna, { tipo: 'cambio', contaId: 'x', valor: '10', moedaDestino: 'USD' }),
  ]);
  await t('OP6', 'Validação: tipo, moeda igual, valor 0/negativo, beneficiário, IBAN, SWIFT, conta de outra cliente → 400', async () => ruins.every((r) => r.status === 400) || ruins.map((r) => r.status));
  await t('OP7', 'Bia não vê as solicitações da Ana', async () => (await L(cBia)).length === 0);
  await t('OP8', 'Cliente não acessa as rotas da equipe (404)', async () => (await req('GET', '/api/cliente/equipe/operacoes', { cookie: cAna })).status === 404);
  await t('OP9', 'Sem Origin do site → 403', async () => (await req('POST', '/api/cliente/operacoes', { cookie: cAna, json: { tipo: 'cambio' }, headers: { Origin: 'https://evil.example' } })).status === 403);
  for (let i = 0; i < 3; i++) await P(cAna, { tipo: 'cambio', contaId: usd, valor: '1', moedaDestino: 'AED' });
  const s6 = await P(cAna, { tipo: 'cambio', contaId: usd, valor: '1', moedaDestino: 'AED' });
  await t('OP10', 'Limite de 5 solicitações em aberto → 429', async () => s6.status === 429 && s6.dados.erro === 'limite_operacoes');

  console.log('--- Equipe analisa');
  const lista = (await E('GET', '/operacoes')).dados.operacoes;
  await t('OP11', 'Admin lista as abertas com nome/e-mail da cliente', async () => lista.length === 5 && lista.every((o) => o.email === 'ana@example.com'));
  const op1 = lista.find((o) => o.tipo === 'transferencia_swift');
  const opC = lista.find((o) => o.tipo === 'cambio' && o.valor === '5000000');
  await t('OP12', '"Em análise" e o cliente vê a nova situação', async () => (await E('POST', `/operacoes/${op1.id}/status`, { json: { status: 'em_analise' } })).status === 200 && (await L(cAna)).find((o) => o.id === op1.id).status === 'em_analise');
  await t('OP13', 'Lançar no extrato antes de concluir → 409', async () => (await E('POST', `/operacoes/${op1.id}/lancar`)).status === 409);
  await t('OP14', 'Recusar sem motivo → 400', async () => (await E('POST', `/operacoes/${opC.id}/status`, { json: { status: 'recusada' } })).status === 400);
  await t('OP15', 'Recusar com motivo → cliente vê "recusada" e o motivo', async () => (await E('POST', `/operacoes/${opC.id}/status`, { json: { status: 'recusada', motivo: 'Valor acima do limite diário.' } })).status === 200 && (await L(cAna)).find((o) => o.id === opC.id).motivo === 'Valor acima do limite diário.');
  await t('OP16', 'Recusada é final: concluir depois → 409', async () => (await E('POST', `/operacoes/${opC.id}/status`, { json: { status: 'concluida' } })).status === 409);
  await t('OP17', 'Concluir → saldo ainda NÃO muda (só ao lançar)', async () => (await E('POST', `/operacoes/${op1.id}/status`, { json: { status: 'concluida' } })).status === 200 && (await saldo(aed)) === '2875000');
  const lanc = await Promise.all([E('POST', `/operacoes/${op1.id}/lancar`), E('POST', `/operacoes/${op1.id}/lancar`), E('POST', `/operacoes/${op1.id}/lancar`)]);
  await t('OP18', 'Lançar no extrato (3 cliques simultâneos) → lança UMA vez: −8.000 e saldo 20.750', async () => lanc.filter((r) => r.status === 200).length === 1 && lanc.filter((r) => r.status === 409).length === 2 && (await saldo(aed)) === '2075000');
  await t('OP19', 'Extrato da cliente mostra "Transferência internacional (SWIFT) — beneficiário"', async () => { const m = (await req('GET', '/api/cliente/financeiro', { cookie: cAna })).dados.movimentos; return m.length === 1 && m[0].valor === '-800000' && m[0].descricao.startsWith('Transferência internacional (SWIFT) — Maria'); });
  await t('OP20', 'Filtros: concluídas 1, recusadas 1, abertas 3', async () => (await E('GET', '/operacoes?status=concluida')).dados.operacoes.length === 1 && (await E('GET', '/operacoes?status=recusada')).dados.operacoes.length === 1 && (await E('GET', '/operacoes')).dados.operacoes.length === 3);
  await t('OP21', 'Resumo do Admin conta as abertas', async () => (await E('GET', '/resumo')).dados.operacoes_abertas === 3);
  await t('OP22', 'Registro guarda as ações da equipe', async () => { const a = (await E('GET', '/registro')).dados.acoes.map((x) => x.acao); return ['operacao_em_analise', 'operacao_recusada', 'operacao_concluida', 'operacao_lancada'].every((x) => a.includes(x)); });
  await t('OP23', 'Agora há vaga: nova solicitação aceita (2 fechadas liberaram)', async () => (await P(cAna, { tipo: 'cambio', contaId: usd, valor: '1', moedaDestino: 'AED' })).status === 201);
  const lApp = await fetch(BASE + '/api/cliente/app/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana@example.com', senha: 'SenhaSegura2026' }) }).then((r) => r.json());
  await t('OP24', 'Pelo app (token), a cliente lê as mesmas solicitações', async () => (await fetch(BASE + '/api/cliente/operacoes', { headers: { Authorization: `Bearer ${lApp.token}` } }).then((r) => r.json())).operacoes.length === 6);
  const sg = await P(cAna, { tipo: 'cambio', contaId: usd, valor: '20.000', moedaDestino: 'AED' });
  const opG = (await E('GET', '/operacoes')).dados.operacoes.find((o) => o.valor === '2000000');
  await E('POST', `/operacoes/${opG.id}/status`, { json: { status: 'concluida' } });
  const lg = await E('POST', `/operacoes/${opG.id}/lancar`);
  await t('OP25', 'Lançar operação maior que o saldo → 409 saldo_insuficiente; saldo e extrato intactos', async () => sg.status === 201 && lg.status === 409 && lg.dados.erro === 'saldo_insuficiente' && (await saldo(usd)) === '1000000' && (await db.q('select movimento_id from operacoes_cliente where id=$1', [opG.id])).rows[0].movimento_id === null);
} catch (e) {
  falhas++; console.log('❌ erro inesperado:', e);
} finally {
  console.log(`\nRESULTADO OPERAÇÕES: ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  srv.kill(); mock.close(); await db.fechar().catch(() => {}); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
