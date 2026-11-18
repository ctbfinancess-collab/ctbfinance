// Testes FOCAIS da revisão técnica Railway (R1–R4). Servidor real (server.mjs) + Postgres REAL (embedded-postgres)
// + volume temporário + Resend falso. Dados fictícios. Asserções do comportamento ESPERADO após a correção.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const livre = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-corr-'));
const ARQ = path.join(TMP, 'volume');
const [PG, PORTA, MOCK] = [await livre(), await livre(), await livre()];
const epg = new EmbeddedPostgres({ databaseDir: path.join(TMP, 'pg'), user: 'ctb', password: 'teste-local', port: PG, persistent: false, onLog: () => {} });
await epg.initialise(); await epg.start(); await epg.createDatabase('ctb_area');
const DATABASE_URL = `postgres://ctb:teste-local@127.0.0.1:${PG}/ctb_area`;
const emails = [];
const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { emails.push(JSON.parse(b)); } catch {} res.end('{"id":"x"}'); }); });
await new Promise((ok) => mock.listen(MOCK, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${PORTA}`;
Object.assign(process.env, { DATABASE_URL, ARQUIVOS_DIR: ARQ, RESEND_API_KEY: 'teste', RESEND_API_BASE: `http://127.0.0.1:${MOCK}`, CONTACT_EMAIL_TO: 'equipe@exemplo.invalid', AREA_COOKIE_INSEGURO: '1', AREA_SITE_URL: BASE });
let srv, logSrv = '';
async function subirServidor() {
  logSrv = '';
  srv = spawn(process.execPath, ['server.mjs'], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA) }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', (d) => (logSrv += d)); srv.stderr.on('data', (d) => (logSrv += d));
  srv.encerrado = new Promise((r) => srv.on('exit', (c) => r(c)));
  for (let i = 0; i < 100 && !/porta/.test(logSrv); i++) await sleep(100);
}
await subirServidor();
const { criarBanco, criarArquivos } = await import('../server/area/nucleo.mjs');
const { criarApi } = await import('../server/area/api.mjs');
const { criarAdmin } = await import('../server/area/admin.mjs');
const { enviarEmailAcesso } = await import('../server/area/emails.mjs');
const db = criarBanco(DATABASE_URL); const arquivos = criarArquivos(ARQ);
const adm = criarAdmin({ db, arquivos, api: criarApi({ db, arquivos, origens: new Set(), enviarEmail: enviarEmailAcesso, siteUrl: BASE }) });

function cliente() {
  let cookie = null;
  const f = async (metodo, rota, { json, corpo, headers = {} } = {}) => {
    const h = { Origin: BASE, ...headers }; if (cookie) h.Cookie = cookie;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; corpo = JSON.stringify(json); }
    const r = await fetch(BASE + rota, { method: metodo, headers: h, body: corpo });
    const sc = r.headers.get('set-cookie'); if (sc) { const v = sc.split(';')[0]; cookie = /=$/.test(v) ? null : v; }
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, dados: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), h: r.headers };
  };
  f.cookie = () => cookie;
  return f;
}
const tokensDe = (to, tipo) => emails.filter((m) => m.to.includes(to)).map((m) => (m.text.match(new RegExp(`[?&]${tipo}=([A-Za-z0-9_-]+)`)) || [])[1]).filter(Boolean);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
let ok = 0, falhas = 0;
async function t(id, desc, fn) { try { const r = await fn(); if (r !== true) throw new Error('condição não atendida' + (r && r !== false ? ' ' + JSON.stringify(r).slice(0, 220) : '')); ok++; console.log(`✅ ${id} ${desc}`); } catch (e) { falhas++; console.log(`❌ ${id} ${desc} → ${String(e.message).slice(0, 240)}`); } }
const anon = cliente();
const SECOES = (process.env.SECOES || 'R1,R2,R3,R4').split(',');
const roda = (x) => SECOES.includes(x);

try {
  if (roda('R1')) {
  console.log('--- R1 Convite/redefinição antigos não podem trocar a senha');
  await adm.convidar('r1@example.com', { nome: 'R1' });
  await adm.convidar('r1@example.com', { nome: 'R1' });                 // reenvio do convite
  const [antigo, novo] = tokensDe('r1@example.com', 'convite');
  const legit = cliente();
  const rNovo = await legit('POST', '/api/cliente/redefinir', { json: { token: novo, senha: 'SenhaLegitima2026' } });
  await t('R1-1', 'Convite MAIS RECENTE define a senha e abre sessão', async () => rNovo.status === 200 && (await legit('GET', '/api/cliente/sessao')).status === 200);
  const rAntigo = await anon('POST', '/api/cliente/redefinir', { json: { token: antigo, senha: 'SenhaDoAtacante2026' } });
  await t('R1-2', `Convite ANTIGO (ainda no prazo) é recusado → ${rAntigo.status} ${JSON.stringify(rAntigo.dados)}`, async () => rAntigo.status === 400 && rAntigo.dados.erro === 'link_invalido');
  await t('R1-3', 'A senha do convite antigo NÃO funciona; a senha legítima continua', async () => (await anon('POST', '/api/cliente/entrar', { json: { email: 'r1@example.com', senha: 'SenhaDoAtacante2026' } })).status === 401 && (await cliente()('POST', '/api/cliente/entrar', { json: { email: 'r1@example.com', senha: 'SenhaLegitima2026' } })).status === 200);
  await t('R1-4', 'A sessão legítima NÃO é derrubada pela tentativa recusada', async () => (await legit('GET', '/api/cliente/sessao')).status === 200);
  // reenvio substitui o link anterior mesmo antes de qualquer uso
  await adm.convidar('r1b@example.com'); await adm.convidar('r1b@example.com');
  const [b1, b2] = tokensDe('r1b@example.com', 'convite');
  await t('R1-5', 'Reenvio: o convite SUPERADO deixa de valer imediatamente (antes de qualquer uso)', async () => (await anon('POST', '/api/cliente/redefinir', { json: { token: b1, senha: 'SenhaQualquer2026' } })).dados.erro === 'link_invalido' && (await cliente()('POST', '/api/cliente/redefinir', { json: { token: b2, senha: 'SenhaQualquer2026' } })).status === 200);
  // dois links válidos do mesmo usuário competindo (convite pendente + redefinição pedida) — sem reenvio entre eles
  await adm.convidar('r1c@example.com');
  const [c1] = tokensDe('r1c@example.com', 'convite');
  await db.q(`insert into tokens_senha(hash, usuario_id, finalidade, expira_em) select $1, id, 'redefinir', now() + interval '1 hour' from usuarios where email='r1c@example.com'`, [crypto.createHash('sha256').update('token-concorrente-c2').digest('hex')]);
  const [x, y] = [cliente(), cliente()];
  const [rx, ry] = await Promise.all([x('POST', '/api/cliente/redefinir', { json: { token: c1, senha: 'SenhaXisXis2026' } }), y('POST', '/api/cliente/redefinir', { json: { token: 'token-concorrente-c2', senha: 'SenhaYpsYps2026' } })]);
  const vencedor = rx.status === 200 ? 'SenhaXisXis2026' : 'SenhaYpsYps2026';
  const perdedor = rx.status === 200 ? 'SenhaYpsYps2026' : 'SenhaXisXis2026';
  await t('R1-6', `Dois links do mesmo usuário ao mesmo tempo: exatamente UM vence (${rx.status}/${ry.status})`, async () => [rx.status, ry.status].sort().join() === '200,400');
  await t('R1-7', 'Estado final consistente: só a senha do vencedor funciona; nenhum link pendente sobra', async () => (await cliente()('POST', '/api/cliente/entrar', { json: { email: 'r1c@example.com', senha: vencedor } })).status === 200 && (await anon('POST', '/api/cliente/entrar', { json: { email: 'r1c@example.com', senha: perdedor } })).status === 401 && (await db.q(`select count(*)::int n from tokens_senha t join usuarios u on u.id=t.usuario_id where u.email='r1c@example.com' and t.usado_em is null`)).rows[0].n === 0);
  await adm.convidar('r1d@example.com'); const [d1] = tokensDe('r1d@example.com', 'convite');
  await db.q(`update tokens_senha set expira_em = now() - interval '1 minute' where hash=$1`, [crypto.createHash('sha256').update(d1).digest('hex')]);
  await t('R1-8', 'Preservado: link vencido continua recusado', async () => (await anon('POST', '/api/cliente/redefinir', { json: { token: d1, senha: 'SenhaVencida2026' } })).dados.erro === 'link_invalido');

  }
  if (roda('R2')) {
  console.log('--- R2 Limite de login atômico (5 verificações por conta na janela)');
  await db.q('delete from tentativas_login');
  await adm.convidar('r2@example.com'); const [r2] = tokensDe('r2@example.com', 'convite');
  const def2 = await cliente()('POST', '/api/cliente/redefinir', { json: { token: r2, senha: 'SenhaValida2026x' } });
    if (def2.status !== 200) throw new Error('senha da conta r2 não foi definida: ' + JSON.stringify(def2.dados));
  await db.q('delete from tentativas_login');
  const lote = await Promise.all(Array.from({ length: 12 }, (_, i) => fetch(BASE + '/api/cliente/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: 'r2@example.com', senha: 'errada-paralela-' + i }) }).then((r) => r.status)));
  const n401 = lote.filter((s) => s === 401).length, n429 = lote.filter((s) => s === 429).length;
  await t('R2-1', `12 tentativas PARALELAS com contagem vazia: no máximo 5 verificadas (401=${n401}, 429=${n429})`, async () => n401 <= 5 && n401 + n429 === 12 && n429 >= 7);
  await t('R2-2', 'Depois do lote: até a senha CERTA recebe 429 durante a janela (controle sequencial preservado)', async () => (await anon('POST', '/api/cliente/entrar', { json: { email: 'r2@example.com', senha: 'SenhaValida2026x' } })).status === 429);
  await t('R2-3', 'Conta inexistente: mesma resposta neutra (401) enquanto abaixo do limite', async () => (await anon('POST', '/api/cliente/entrar', { json: { email: 'inexistente-r2@example.com', senha: 'qualquer123456' } })).status === 401);
  await db.q('delete from tentativas_login');
  await t('R2-4', 'Login legítimo (senha certa) funciona e não consome o limite', async () => { const r = await cliente()('POST', '/api/cliente/entrar', { json: { email: 'r2@example.com', senha: 'SenhaValida2026x' } }); const n = (await db.q(`select count(*)::int n from tentativas_login where chave='email:r2@example.com'`)).rows[0].n; return r.status === 200 && n === 0; });
  const seq = []; for (let i = 0; i < 6; i++) seq.push((await anon('POST', '/api/cliente/entrar', { json: { email: 'r2@example.com', senha: 'errada-seq-' + i } })).status);
  await t('R2-5', `Sequencial preservado: 5 erros e a 6ª tentativa limitada (${seq.join(',')})`, async () => seq.slice(0, 5).every((s) => s === 401) && seq[5] === 429);

  }
  if (roda('R3')) {
  console.log('--- R3 Erros e abortos no download não derrubam o servidor');
  await adm.convidar('r3@example.com'); const [r3] = tokensDe('r3@example.com', 'convite');
  const c3 = cliente(); await c3('POST', '/api/cliente/redefinir', { json: { token: r3, senha: 'SenhaDownload2026' } });
  const up = async (buf, nome) => (await c3('POST', '/api/cliente/documentos', { corpo: buf, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': nome } })).dados.documento;
  const docOk = await up(PDF, 'normal.pdf');
  const docSumido = await up(PDF, 'sumido.pdf');
  const docSemPermissao = await up(PDF, 'sem-permissao.pdf');
  const grande = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(8 * 1024 * 1024, 0x20), Buffer.from('\n%%EOF\n')]);
  const docGrande = await up(grande, 'grande.pdf');
  const chave = async (id) => (await db.q('select chave_arquivo from documentos where id=$1', [id])).rows[0].chave_arquivo;
  fs.rmSync(arquivos.caminho(await chave(docSumido.id)));                       // arquivo some depois do registro
  fs.chmodSync(arquivos.caminho(await chave(docSemPermissao.id)), 0o000);       // falha de abertura (EACCES)
  const s1 = await c3('GET', `/api/cliente/documentos/${docSumido.id}/arquivo`);
  await t('R3-1', `Arquivo ausente → resposta controlada (${s1.status} ${JSON.stringify(s1.dados)}), sem cabeçalho 200`, async () => s1.status === 409 && s1.dados.erro === 'arquivo_ausente');
  const s2 = await c3('GET', `/api/cliente/documentos/${docSemPermissao.id}/arquivo`);
  await t('R3-2', `Falha de abertura (sem permissão) → resposta controlada (${s2.status})`, async () => s2.status >= 400 && s2.status < 600 && s2.status !== 200);
  await t('R3-3', 'Servidor continua de pé e atende a requisição seguinte', async () => srv.exitCode === null && (await c3('GET', '/api/cliente/sessao')).status === 200);
  // cliente aborta no meio de uma transferência grande
  const ctrl = new AbortController();
  const resp = await fetch(`${BASE}/api/cliente/documentos/${docGrande.id}/arquivo`, { headers: { Cookie: c3.cookie(), Origin: BASE }, signal: ctrl.signal });
  const leitor = resp.body.getReader(); await leitor.read(); ctrl.abort(); await sleep(300);
  await t('R3-4', 'Cliente aborta no meio do download → servidor continua atendendo', async () => srv.exitCode === null && (await c3('GET', '/api/cliente/sessao')).status === 200);
  const s5 = await c3('GET', `/api/cliente/documentos/${docOk.id}/arquivo`);
  await t('R3-5', 'Download normal preservado: 200, bytes idênticos, no-store, anexo, nosniff, Content-Length', async () => s5.status === 200 && Buffer.from(s5.dados).equals(PDF) && /no-store/.test(s5.h.get('cache-control')) && /attachment/.test(s5.h.get('content-disposition')) && s5.h.get('x-content-type-options') === 'nosniff' && Number(s5.h.get('content-length')) === PDF.length);
  await t('R3-6', 'Registro de acesso só para o download que foi entregue (não para os que falharam antes de enviar)', async () => { const r = (await db.q('select documento_id from acessos_documentos')).rows.map((x) => x.documento_id); return r.includes(docOk.id) && !r.includes(docSumido.id) && !r.includes(docSemPermissao.id); });
  fs.chmodSync(arquivos.caminho(await chave(docSemPermissao.id)), 0o600);

  }
  if (roda('R4')) {
  console.log('--- R4 Data/hora impossível na confirmação de agendamento');
  await adm.convidar('r4@example.com');
  const ag = await adm.registrarAgendamento('r4@example.com', '2026-11-27', 'Teste');
  const valor = async () => (await db.q('select horario_confirmado from agendamentos where id=$1', [ag.id])).rows[0].horario_confirmado;
  for (const [entrada, desc] of [['2026-02-31T14:00', '31 de fevereiro'], ['2026-11-27T99:99', 'hora 99:99'], ['2026-13-01T14:00', 'mês 13'], ['2026-02-29T10:00', '29/02 em ano NÃO bissexto'], ['2026-11-27T24:00', 'hora 24:00'], ['2026-04-31T09:00', '31 de abril'], ['2026-11-00T10:00', 'dia 0']]) {
    let erro = null; try { await adm.confirmarAgendamento(ag.id, entrada, 'teste', { remarcar: true }); } catch (e) { erro = e.message; }
    await t(`R4 ${entrada}`, `${desc} é recusado e NADA é gravado`, async () => Boolean(erro) && (await valor()) === null);
  }
  await adm.confirmarAgendamento(ag.id, '2026-11-27T14:00', 'teste', { remarcar: true });
  await t('R4-ok1', 'Controle válido: 27/11/2026 14:00 Dubai = 10:00 UTC', async () => (await valor()).toISOString() === '2026-11-27T10:00:00.000Z');
  await adm.confirmarAgendamento(ag.id, '2028-02-29T09:30', 'teste', { remarcar: true });
  await t('R4-ok2', 'Controle válido: 29/02/2028 (bissexto) 09:30 Dubai = 05:30 UTC', async () => (await valor()).toISOString() === '2028-02-29T05:30:00.000Z');
  await adm.confirmarAgendamento(ag.id, '2026-12-31T23:59', 'teste', { remarcar: true });
  await t('R4-ok3', 'Controle válido: 31/12/2026 23:59 Dubai = 19:59 UTC', async () => (await valor()).toISOString() === '2026-12-31T19:59:00.000Z');
  await adm.confirmarAgendamento(ag.id, '2026-11-28T00:30', 'teste', { remarcar: true });
  await t('R4-ok4', 'Controle válido: 28/11 00:30 Dubai = 27/11 20:30 UTC (virada do dia)', async () => (await valor()).toISOString() === '2026-11-27T20:30:00.000Z');
  }
} finally {
  console.log(`\nRESULTADO CORREÇÕES RAILWAY (R1–R4): ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  const caiu = srv.exitCode !== null;
  if (caiu) console.log(`(servidor ENCERROU durante os testes, código ${srv.exitCode}) — trecho do log:\n${logSrv.slice(-1200)}`);
  srv.kill(); mock.close(); await db.fechar(); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
  if (falhas) process.exitCode = 1;
}
// encerra explicitamente: a biblioteca do Postgres de teste (async-exit-hook) sobrescreveria o código de saída
process.exit(falhas ? 1 : 0);
