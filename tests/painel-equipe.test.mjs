// Testes do PAINEL DA EQUIPE (rotas /api/cliente/equipe/*): permissões, ações, registro e segurança.
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
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-painel-'));
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

const hojeDubai = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
const dias = (n) => { const d = new Date(hojeDubai() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const esperar = async (fn, ms = 5000) => { for (let i = 0; i < ms / 100; i++) { const v = await fn(); if (v) return v; await sleep(100); } return null; };
const entrar = async (email, senha) => (await req('POST', '/api/cliente/entrar', { json: { email, senha } })).cookie;

try {
  // equipe: chefe@ ; clientes: cli@ (com passaporte, documento e pedido) e outro@
  const cChefe = await contaComSenha('chefe@example.com', 'SenhaSegura2026');
  await adm.concederEquipe('chefe@example.com');
  const cCli = await contaComSenha('cli@example.com', 'SenhaSegura2026');
  await req('PUT', '/api/cliente/perfil', { cookie: cCli, json: { display_name: '<img src=x onerror=alert(1)> Cliente', passportnumber: 'AB1234567', passportexpirationdate: '2030-01-31' } });
  const doc = (await req('POST', '/api/cliente/documentos', { cookie: cCli, corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'passaporte.pdf' } })).dados.documento;
  const doc2 = (await req('POST', '/api/cliente/documentos', { cookie: cCli, corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'comprovante.pdf' } })).dados.documento;
  const ag = (await req('POST', '/api/cliente/agendamentos', { cookie: cCli, json: { assunto: 'investimentos', data: dias(5), formato: 'video', periodo: 'tarde' } })).dados.agendamento;
  const cOutro = await contaComSenha('outro@example.com', 'SenhaSegura2026');
  const E = (m, r, o = {}) => req(m, '/api/cliente/equipe' + r, { ...o, cookie: cChefe });
  const cli = (await db.q(`select id from usuarios where email='cli@example.com'`)).rows[0].id;
  const chefeId = (await db.q(`select id from usuarios where email='chefe@example.com'`)).rows[0].id;

  console.log('--- Permissões');
  const rotas = [['GET', '/resumo'], ['GET', '/clientes'], ['GET', `/clientes/${cli}`], ['POST', '/clientes'], ['POST', `/clientes/${cli}/bloquear`], ['GET', '/agendamentos'], ['POST', `/agendamentos/${ag.id}/confirmar`], ['GET', '/documentos'], ['POST', `/documentos/${doc.id}/decidir`], ['GET', '/registro']];
  const deCliente = await Promise.all(rotas.map(([m, r]) => req(m, '/api/cliente/equipe' + r, { cookie: cOutro, json: m === 'POST' ? { decisao: 'aprovado', email: 'x@y.com' } : undefined })));
  await t('PE1', `Cliente comum: TODAS as rotas do painel respondem 404 (${[...new Set(deCliente.map((r) => r.status))]})`, async () => deCliente.every((r) => r.status === 404));
  const semSessao = await Promise.all(rotas.map(([m, r]) => req(m, '/api/cliente/equipe' + r)));
  await t('PE2', 'Sem sessão: 401 em todas', async () => semSessao.every((r) => r.status === 401));
  await t('PE3', 'Equipe sem Origin do site (CSRF) → 403 e nada acontece', async () => (await req('POST', `/api/cliente/equipe/clientes/${cli}/bloquear`, { cookie: cChefe, json: {}, headers: { Origin: 'https://evil.example' } })).status === 403 && (await db.q(`select bloqueado from usuarios where id=$1`, [cli])).rows[0].bloqueado === false);
  await t('PE4', 'Sessão informa o papel (equipe: true para a equipe, false para cliente)', async () => (await req('GET', '/api/cliente/sessao', { cookie: cChefe })).dados.equipe === true && (await req('GET', '/api/cliente/sessao', { cookie: cOutro })).dados.equipe === false);

  console.log('--- Visão geral e clientes');
  const res = (await E('GET', '/resumo')).dados;
  await t('PE5', `Resumo: ${JSON.stringify(res)}`, async () => res.clientes === 2 && res.documentos_em_analise === 2 && res.agendamentos_pendentes === 1 && res.passaportes_a_conferir === 1 && res.convites_pendentes === 0);
  const busca = (await E('GET', '/clientes?q=cli@')).dados.clientes;
  await t('PE6', 'Busca por e-mail encontra só o cliente certo, com pendências e passaporte "a conferir"', async () => busca.length === 1 && busca[0].email === 'cli@example.com' && busca[0].docs_em_analise === 2 && busca[0].agend_pendentes === 1 && busca[0].tem_passaporte && !busca[0].passaporte_conferido_em);
  const ficha = (await E('GET', `/clientes/${cli}`)).dados;
  await t('PE7', 'Ficha mostra o número COMPLETO do passaporte à equipe, documentos e agendamentos', async () => ficha.dados.passportnumber === 'AB1234567' && ficha.documentos.length === 2 && ficha.agendamentos.length === 1);
  await t('PE8', 'Ficha inexistente ou id malformado → 404', async () => (await E('GET', '/clientes/00000000-0000-0000-0000-000000000000')).status === 404 && (await E('GET', "/clientes/1' or '1'='1")).status === 404);
  const n0 = emails.length;
  const conv = await E('POST', '/clientes', { json: { email: 'Novo@Example.com', nome: 'Novo Cliente', idioma: 'en' } });
  const eConv = await esperar(() => emails.slice(n0).find((m) => m.to.includes('novo@example.com')));
  await t('PE9', 'Convidar pelo painel: conta criada, convite em INGLÊS enviado, idioma guardado', async () => conv.status === 200 && conv.dados.convite === 'convite_enviado' && eConv && /Client Area/.test(eConv.subject) && (await db.q(`select idioma from usuarios where email='novo@example.com'`)).rows[0].idioma === 'en');
  const ruins = await Promise.all([{ email: 'semarroba' }, { email: '' }, null, [1, 2], 'texto'].map((j) => req('POST', '/api/cliente/equipe/clientes', { cookie: cChefe, corpo: JSON.stringify(j), headers: { 'Content-Type': 'application/json' } })));
  await t('PE10', `E-mail inválido / corpo nulo, lista ou texto → 400 sem derrubar (${ruins.map((r) => r.status)})`, async () => ruins.every((r) => r.status === 400));
  const novoId = (await db.q(`select id from usuarios where email='novo@example.com'`)).rows[0].id;
  const n1 = emails.length;
  await t('PE11', 'Reenviar convite → novo e-mail (o link anterior deixa de valer)', async () => (await E('POST', `/clientes/${novoId}/reenviar`, { json: {} })).status === 200 && !!(await esperar(() => emails.length > n1)));

  console.log('--- Bloqueio e passaporte');
  const blq = await E('POST', `/clientes/${cli}/bloquear`, { json: {} });
  await t('PE12', 'Bloquear: sessões do cliente caem na hora (401)', async () => blq.status === 200 && (await req('GET', '/api/cliente/perfil', { cookie: cCli })).status === 401);
  await t('PE13', 'A equipe não consegue bloquear a própria conta (409)', async () => (await E('POST', `/clientes/${chefeId}/bloquear`, { json: {} })).status === 409);
  await t('PE14', 'Reenviar acesso para conta bloqueada → 409 (desbloqueie antes)', async () => (await E('POST', `/clientes/${cli}/reenviar`, { json: {} })).status === 409);
  await E('POST', `/clientes/${cli}/desbloquear`, { json: {} });
  const cCli2 = await entrar('cli@example.com', 'SenhaSegura2026');
  await t('PE15', 'Desbloquear: cliente volta a entrar', async () => !!cCli2 && (await req('GET', '/api/cliente/perfil', { cookie: cCli2 })).status === 200);
  await t('PE16', 'Conferir passaporte → travado para o cliente (409 ao tentar mudar)', async () => (await E('POST', `/clientes/${cli}/passaporte-conferir`, { json: {} })).status === 200 && (await req('PUT', '/api/cliente/perfil', { cookie: cCli2, json: { passportnumber: 'ZZ999999' } })).status === 409);
  await t('PE17', 'Resposta do "conferir" não repete o número completo', async () => !JSON.stringify((await E('POST', `/clientes/${cli}/passaporte-conferir`, { json: {} })).dados).includes('AB1234567'));
  await t('PE18', 'Destravar → cliente pode mudar de novo', async () => (await E('POST', `/clientes/${cli}/passaporte-liberar`, { json: {} })).status === 200 && (await req('PUT', '/api/cliente/perfil', { cookie: cCli2, json: { passportnumber: 'AB1234567' } })).status === 200);
  const outroId = (await db.q(`select id from usuarios where email='outro@example.com'`)).rows[0].id;
  await t('PE19', 'Conferir passaporte que o cliente não informou → 409 com mensagem clara', async () => { const r = await E('POST', `/clientes/${outroId}/passaporte-conferir`, { json: {} }); return r.status === 409 && /ainda não informou/.test(r.dados.mensagem); });
  await t('PE20', 'Ação desconhecida → 404', async () => (await E('POST', `/clientes/${cli}/apagar-tudo`, { json: {} })).status === 404);

  console.log('--- Agendamentos');
  const lista = (await E('GET', '/agendamentos')).dados.agendamentos;
  await t('PE21', 'Lista de pendentes traz cliente, formato e horário preferido', async () => lista.length === 1 && lista[0].email === 'cli@example.com' && lista[0].formato === 'video' && lista[0].periodo === 'tarde');
  await t('PE22', 'Data/hora inválida (31/02, 25:00, texto) → 400', async () => { const rs = await Promise.all(['2027-02-31T10:00', `${dias(5)}T25:00`, 'amanhã'].map((d) => E('POST', `/agendamentos/${ag.id}/confirmar`, { json: { dataHora: d } }))); return rs.every((r) => r.status === 400); });
  await t('PE23', 'Agendamento inexistente → 404', async () => (await E('POST', '/agendamentos/00000000-0000-0000-0000-000000000000/confirmar', { json: { dataHora: `${dias(5)}T10:00` } })).status === 404);
  const n2 = emails.length;
  const conf = await E('POST', `/agendamentos/${ag.id}/confirmar`, { json: { dataHora: `${dias(5)}T14:30`, avisar: true } });
  const eConf = await esperar(() => emails.slice(n2).find((m) => m.to.includes('cli@example.com')));
  await t('PE24', 'Confirmar pelo painel: cliente recebe "Agendamento confirmado" (14:30 Dubai) e vê na Área do Cliente', async () => conf.status === 200 && conf.dados.emailCliente === 'enviado' && eConf && /14:30/.test(eConf.html) && (await req('GET', '/api/cliente/agendamentos', { cookie: cCli2 })).dados.agendamentos[0].horarioConfirmado === new Date(`${dias(5)}T10:30:00Z`).toISOString());
  const n3 = emails.length;
  await E('POST', `/agendamentos/${ag.id}/confirmar`, { json: { dataHora: `${dias(5)}T15:00`, avisar: false } }); await sleep(300);
  await t('PE25', 'Reconfirmar sem e-mail (caixa desmarcada) → nenhum e-mail', async () => emails.length === n3);
  await t('PE26', 'Lista de pendentes fica vazia; com "todos" aparece o confirmado', async () => (await E('GET', '/agendamentos')).dados.agendamentos.length === 0 && (await E('GET', '/agendamentos?todos=1')).dados.agendamentos.length === 1);

  console.log('--- Documentos');
  const docs = (await E('GET', '/documentos?status=disponivel_analise')).dados.documentos;
  await t('PE27', 'Em análise: os 2 documentos do cliente, com nome e e-mail', async () => docs.length === 2 && docs.every((d) => d.email === 'cli@example.com'));
  const dl = await req('GET', `/api/cliente/documentos/${doc.id}/arquivo`, { cookie: cChefe });
  await t('PE28', 'Equipe baixa o arquivo (mesmos bytes) e o acesso fica registrado como "equipe"', async () => dl.status === 200 && Buffer.from(dl.dados).equals(PDF) && (await db.q(`select papel from acessos_documentos where documento_id=$1 order by id desc limit 1`, [doc.id])).rows[0].papel === 'equipe');
  await t('PE29', 'Rejeitar sem orientação → 400', async () => (await E('POST', `/documentos/${doc2.id}/decidir`, { json: { decisao: 'rejeitado', orientacaoPt: '  ' } })).status === 400);
  await t('PE30', 'Decisão inválida → 400', async () => (await E('POST', `/documentos/${doc2.id}/decidir`, { json: { decisao: 'apagar' } })).status === 400);
  await t('PE31', 'Aprovar → cliente vê "aprovado"', async () => (await E('POST', `/documentos/${doc.id}/decidir`, { json: { decisao: 'aprovado' } })).status === 200 && (await req('GET', '/api/cliente/documentos', { cookie: cCli2 })).dados.documentos.find((d) => d.id === doc.id).status === 'aprovado');
  await t('PE32', 'Rejeitar com orientação → cliente vê a orientação', async () => (await E('POST', `/documentos/${doc2.id}/decidir`, { json: { decisao: 'rejeitado', orientacaoPt: 'Imagem ilegível, envie de novo.' } })).status === 200 && (await req('GET', '/api/cliente/documentos', { cookie: cCli2 })).dados.documentos.find((d) => d.id === doc2.id).orientacao.pt === 'Imagem ilegível, envie de novo.');
  await t('PE33', 'Decidir de novo o mesmo documento → 409 (não refaz por engano)', async () => (await E('POST', `/documentos/${doc.id}/decidir`, { json: { decisao: 'rejeitado', orientacaoPt: 'x' } })).status === 409);

  console.log('--- Registro e sessão da equipe');
  const reg = (await E('GET', '/registro')).dados.acoes.map((a) => a.acao);
  await t('PE34', `Registro guarda cada ação com quem fez (${[...new Set(reg)].join(', ')})`, async () => ['ver_ficha', 'convidar', 'reenviar', 'bloquear', 'desbloquear', 'passaporte_conferir', 'passaporte_liberar', 'confirmar_agendamento', 'aprovar_documento', 'rejeitar_documento'].every((a) => reg.includes(a)) && (await db.q(`select count(*)::int n from acoes_equipe where por_email <> 'chefe@example.com'`)).rows[0].n === 0);
  await adm.revogarEquipe('chefe@example.com');
  await t('PE35', 'Papel de equipe revogado → painel some na hora (404), mesma sessão', async () => (await E('GET', '/resumo')).status === 404);
  await adm.concederEquipe('chefe@example.com');
  await db.q(`update sessoes set ultimo_uso_em = now() - interval '31 minutes' where usuario_id=$1`, [chefeId]);
  await t('PE36', 'Equipe parada há 31 min → sessão encerrada (401); cliente parado 31 min continua', async () => { await db.q(`update sessoes set ultimo_uso_em = now() - interval '31 minutes' where usuario_id=(select id from usuarios where email='cli@example.com')`); return (await E('GET', '/resumo')).status === 401 && (await req('GET', '/api/cliente/perfil', { cookie: cCli2 })).status === 200; });
  await t('PE37', 'Servidor de pé', async () => vivo());
} catch (e) {
  falhas++; console.log('❌ erro inesperado:', e);
} finally {
  console.log(`\nRESULTADO PAINEL DA EQUIPE: ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  srv.kill(); mock.close(); await db.fechar().catch(() => {}); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
