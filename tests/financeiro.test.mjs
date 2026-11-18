// Testes do FINANCEIRO (consulta): equipe lança no Admin, cliente vê só os dele; validação e registro.
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
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-fin-'));
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
  const F = async (cookie) => (await req('GET', '/api/cliente/financeiro', { cookie })).dados;

  console.log('--- Sem dados lançados');
  const vazio = await F(cAna);
  await t('FI1', 'Cliente sem lançamentos → tudo vazio, sem número inventado', async () => vazio.contas.length === 0 && vazio.movimentos.length === 0 && vazio.posicoes.length === 0 && vazio.cartao === null && vazio.atualizadoEm === null);

  console.log('--- Equipe lança');
  const c1 = await E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'digital', moeda: 'AED', saldo: '28.750,00' } });
  const c2 = await E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'global', moeda: 'USD', saldo: '12480.5' } });
  await t('FI2', 'Contas: AED 28.750,00 e USD 12480.5 gravadas em centavos', async () => c1.status === 200 && c2.status === 200 && (await F(cAna)).contas.map((c) => `${c.tipo}:${c.moeda}:${c.saldo}`).sort().join('|') === 'digital:AED:2875000|global:USD:1248050');
  await E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'digital', moeda: 'AED', saldo: '30000' } });
  await t('FI3', 'Mesma conta (tipo+moeda) → atualiza o saldo em vez de duplicar', async () => { const cs = (await F(cAna)).contas; return cs.length === 2 && cs.find((c) => c.tipo === 'digital').saldo === '3000000'; });
  const m1 = await E('POST', `/clientes/${ana}/movimentos`, { json: { contaId: c1.dados.id, data: '2026-11-17', descricao: 'Aplicação — Fundo Global', valor: '-25.000,00' } });
  const m2 = await E('POST', `/clientes/${ana}/movimentos`, { json: { contaId: c1.dados.id, data: '2026-11-12', descricao: 'Rendimento', valor: '1350' } });
  await t('FI4', 'Movimentações: débito negativo e crédito positivo, mais recentes primeiro', async () => { const ms = (await F(cAna)).movimentos; return m1.status === 201 && m2.status === 201 && ms.length === 2 && ms[0].valor === '-2500000' && ms[1].valor === '135000' && ms[0].moeda === 'AED'; });
  const saldoDig = async () => (await F(cAna)).contas.find((c) => c.tipo === 'digital').saldo;
  await t('FI4b', 'Saldo atualiza sozinho: 30.000 − 25.000 + 1.350 = 6.350,00', async () => (await saldoDig()) === '635000' && m2.dados.saldo === '635000');
  const m3 = await E('POST', `/clientes/${ana}/movimentos`, { json: { contaId: c1.dados.id, data: '2026-11-18', descricao: 'Depósito recebido', valor: '8000' } });
  await E('DELETE', `/clientes/${ana}/movimentos/${m3.dados.id}`);
  await t('FI4c', 'Excluir a movimentação desfaz o efeito no saldo (volta a 6.350,00)', async () => (await saldoDig()) === '635000');
  await Promise.all(Array.from({ length: 10 }, () => E('POST', `/clientes/${ana}/movimentos`, { json: { contaId: c1.dados.id, data: '2026-11-18', descricao: 'Rendimento', valor: '1' } })));
  await t('FI4d', '10 lançamentos simultâneos → saldo soma todos (sem perder nenhum)', async () => (await saldoDig()) === '636000');
  const antigo = (await db.q(`insert into movimentos_cliente(usuario_id, conta_id, data, descricao, valor_centavos, criado_por) values ($1,$2,'2026-11-01','Lançamento antigo',500000,'x') returning id`, [ana, c1.dados.id])).rows[0].id;
  await E('DELETE', `/clientes/${ana}/movimentos/${antigo}`);
  await t('FI4e', 'Excluir lançamento antigo (anterior à regra) NÃO mexe no saldo', async () => (await saldoDig()) === '636000');
  for (const m of (await F(cAna)).movimentos.filter((x) => x.descricao === 'Rendimento' && x.valor === '100')) await E('DELETE', `/clientes/${ana}/movimentos/${m.id}`);
  const p1 = await E('PUT', `/clientes/${ana}/posicoes`, { json: { classe: 'renda_fixa', descricao: 'Bond 2030', moeda: 'USD', valor: '400.000,00' } });
  await E('PUT', `/clientes/${ana}/posicoes`, { json: { classe: 'fundos', descricao: 'Fundo Global', moeda: 'USD', valor: '200000' } });
  await E('PUT', `/clientes/${ana}/posicoes`, { json: { id: p1.dados.id, classe: 'renda_fixa', descricao: 'Bond 2031', moeda: 'USD', valor: '410000' } });
  await t('FI5', 'Posições de investimento: criar e corrigir', async () => { const ps = (await F(cAna)).posicoes; return ps.length === 2 && ps.find((p) => p.classe === 'renda_fixa').descricao === 'Bond 2031' && ps.find((p) => p.classe === 'renda_fixa').valor === '41000000'; });
  const ca = await E('PUT', `/clientes/${ana}/cartao`, { json: { final: '3478', bandeira: 'Visa', situacao: 'ativo', moeda: 'AED', limite: '50000', fatura: '5.420,00', vencimento: '2026-12-05' } });
  await t('FI6', 'Cartão: final, situação, fatura e vencimento', async () => { const k = (await F(cAna)).cartao; return ca.status === 200 && k.final === '3478' && k.fatura === '542000' && k.vencimento === '2026-12-05'; });
  await t('FI7', 'Data da última atualização aparece para o cliente', async () => !!(await F(cAna)).atualizadoEm);

  console.log('--- Isolamento e permissões');
  await t('FI8', 'Outra cliente (Bia) NÃO vê nada da Ana', async () => { const b = await F(cBia); return b.contas.length === 0 && b.movimentos.length === 0 && b.posicoes.length === 0 && b.cartao === null; });
  await t('FI9', 'Cliente comum não consegue lançar (rotas da equipe → 404)', async () => (await req('PUT', `/api/cliente/equipe/clientes/${ana}/contas`, { cookie: cBia, json: { tipo: 'digital', moeda: 'AED', saldo: '999999' } })).status === 404 && (await req('PUT', `/api/cliente/equipe/clientes/${bia}/contas`, { cookie: cBia, json: { tipo: 'digital', moeda: 'AED', saldo: '1' } })).status === 404);
  await t('FI10', 'Sem sessão → 401; sem Origin do site → 403', async () => (await req('GET', '/api/cliente/financeiro')).status === 401 && (await req('PUT', `/api/cliente/equipe/clientes/${ana}/contas`, { cookie: cChefe, json: { tipo: 'digital', moeda: 'AED', saldo: '1' }, headers: { Origin: 'https://evil.example' } })).status === 403);
  const contaBia = (await E('PUT', `/clientes/${bia}/contas`, { json: { tipo: 'digital', moeda: 'AED', saldo: '10' } })).dados.id;
  await t('FI11', 'Lançar movimento da Ana numa conta da Bia → recusado (400)', async () => (await E('POST', `/clientes/${ana}/movimentos`, { json: { contaId: contaBia, data: '2026-11-17', descricao: 'x', valor: '1' } })).status === 400);
  await t('FI12', 'Excluir movimento/posição/conta de outra cliente → 404', async () => (await E('DELETE', `/clientes/${bia}/movimentos/${m1.dados.id}`)).status === 404 && (await E('DELETE', `/clientes/${bia}/posicoes/${p1.dados.id}`)).status === 404 && (await E('DELETE', `/clientes/${bia}/contas/${c1.dados.id}`)).status === 404);

  console.log('--- Validação');
  const ruins = await Promise.all([
    E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'poupanca', moeda: 'AED', saldo: '1' } }),
    E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'digital', moeda: 'BTC', saldo: '1' } }),
    E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'digital', moeda: 'AED', saldo: 'mil' } }),
    E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'digital', moeda: 'AED', saldo: '1.5.6' } }),
    E('POST', `/clientes/${ana}/movimentos`, { json: { contaId: c1.dados.id, data: '2026-02-30', descricao: 'x', valor: '1' } }),
    E('POST', `/clientes/${ana}/movimentos`, { json: { contaId: c1.dados.id, data: '2026-11-17', descricao: '', valor: '1' } }),
    E('POST', `/clientes/${ana}/movimentos`, { json: { contaId: c1.dados.id, data: '2026-11-17', descricao: 'x', valor: '0' } }),
    E('PUT', `/clientes/${ana}/posicoes`, { json: { classe: 'cripto', descricao: 'x', moeda: 'USD', valor: '1' } }),
    E('PUT', `/clientes/${ana}/posicoes`, { json: { classe: 'fundos', descricao: 'x', moeda: 'USD', valor: '-5' } }),
    E('PUT', `/clientes/${ana}/cartao`, { json: { final: '12', situacao: 'ativo', moeda: 'AED' } }),
    E('PUT', `/clientes/${ana}/cartao`, { json: { final: '1234', situacao: 'roubado', moeda: 'AED' } }),
    E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'digital', moeda: 'AED', saldo: '99999999999999' } }),
  ]);
  await t('FI13', `Tipos, moedas, valores, datas e situações inválidos → 400 (${ruins.map((r) => r.status)})`, async () => ruins.every((r) => r.status === 400));

  console.log('--- Exclusões e registro');
  await t('FI14', 'Excluir movimento → some do extrato da cliente', async () => (await E('DELETE', `/clientes/${ana}/movimentos/${m2.dados.id}`)).status === 200 && (await F(cAna)).movimentos.length === 1);
  await t('FI15', 'Remover cartão → cliente volta a não ter cartão', async () => (await E('PUT', `/clientes/${ana}/cartao`, { json: { remover: true } })).status === 200 && (await F(cAna)).cartao === null);
  const acoes = (await db.q(`select acao from acoes_equipe where acao like 'financeiro%'`)).rows.map((r) => r.acao);
  await t('FI16', `Tudo registrado no Registro da equipe (${[...new Set(acoes)].length} tipos)`, async () => ['financeiro_conta', 'financeiro_movimento', 'financeiro_posicao', 'financeiro_cartao', 'financeiro_movimento_excluido', 'financeiro_cartao_removido'].every((a) => acoes.includes(a)));
  const fichaFin = (await E('GET', `/clientes/${ana}/financeiro`)).dados;
  await t('FI17', 'Admin lê o financeiro da cliente com quem lançou', async () => fichaFin.contas.every((c) => c.atualizado_por === 'chefe@example.com') && fichaFin.movimentos[0].criado_por === 'chefe@example.com');
  const lApp = await fetch(BASE + '/api/cliente/app/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana@example.com', senha: 'SenhaSegura2026' }) }).then((r) => r.json());
  await t('FI18', 'Pelo app (token), a cliente lê o mesmo financeiro', async () => (await fetch(BASE + '/api/cliente/financeiro', { headers: { Authorization: `Bearer ${lApp.token}` } }).then((r) => r.json())).contas.length === 2);
} catch (e) {
  falhas++; console.log('❌ erro inesperado:', e);
} finally {
  console.log(`\nRESULTADO FINANCEIRO: ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  srv.kill(); mock.close(); await db.fechar().catch(() => {}); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
