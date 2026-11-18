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
  const nomeAntes = (await db.q(`select dados->>'display_name' n from perfis p join usuarios u on u.id=p.usuario_id where u.email='cli@example.com'`)).rows[0].n;
  const nX = emails.length;
  const dupConv = await E('POST', '/clientes', { json: { email: 'cli@example.com', nome: 'Outra Pessoa', idioma: 'en' } }); await sleep(300);
  await t('PE10b', 'Convidar e-mail que já tem conta → 409; nome e idioma NÃO mudam; nenhum e-mail', async () => dupConv.status === 409 && dupConv.dados.erro === 'ja_existe' && emails.length === nX && (await db.q(`select u.idioma, p.dados->>'display_name' n from perfis p join usuarios u on u.id=p.usuario_id where u.email='cli@example.com'`)).rows[0].n === nomeAntes && (await db.q(`select idioma from usuarios where email='cli@example.com'`)).rows[0].idioma === 'pt');
  const convPj = await E('POST', '/clientes', { json: { email: 'empresa@example.com', nome: 'Rep Exemplo', idioma: 'pt', tipo: 'pj', empresa: 'Empresa Exemplo LLC', registro: 'REG-123', pais: 'United Arab Emirates', cargo: 'CEO' } });
  const semEmp = await E('POST', '/clientes', { json: { email: 'semempresa@example.com', tipo: 'pj', empresa: '' } });
  const dPj = (await db.q(`select p.dados from perfis p join usuarios u on u.id=p.usuario_id where u.email='empresa@example.com'`)).rows[0]?.dados || {};
  await t('PE9b', 'Convidar como Pessoa jurídica: empresa, registro, país e cargo já gravados no perfil; sem nome da empresa → 400', async () => convPj.status === 200 && dPj.display_name === 'Rep Exemplo' && dPj.CompanyName === 'Empresa Exemplo LLC' && dPj.Companyregistrationnumber === 'REG-123' && dPj.companycountry === 'United Arab Emirates' && dPj.companyposition === 'CEO' && semEmp.status === 400);
  const novoId = (await db.q(`select id from usuarios where email='novo@example.com'`)).rows[0].id;
  const n1 = emails.length;
  await t('PE11', 'Reenviar convite → novo e-mail (o link anterior deixa de valer)', async () => (await E('POST', `/clientes/${novoId}/reenviar`, { json: {} })).status === 200 && !!(await esperar(() => emails.length > n1)));

  console.log('--- Bloqueio e passaporte');
  const blq = await E('POST', `/clientes/${cli}/bloquear`, { json: {} });
  await t('PE12', 'Bloquear: sessões do cliente caem na hora (401)', async () => blq.status === 200 && (await req('GET', '/api/cliente/perfil', { cookie: cCli })).status === 401);
  await t('PE13', 'A equipe não consegue bloquear a própria conta (409)', async () => (await E('POST', `/clientes/${chefeId}/bloquear`, { json: {} })).status === 409);
  const nB = emails.length;
  await t('PE14', 'Conta bloqueada: reenviar pela ficha OU convidar pelo formulário → 409, nenhum e-mail', async () => (await E('POST', `/clientes/${cli}/reenviar`, { json: {} })).status === 409 && (await E('POST', '/clientes', { json: { email: 'cli@example.com' } })).status === 409 && (await sleep(300), emails.length === nB));
  await contaComSenha('chefe2@example.com', 'SenhaSegura2026'); await adm.concederEquipe('chefe2@example.com');
  const chefe2Id = (await db.q(`select id from usuarios where email='chefe2@example.com'`)).rows[0].id;
  await t('PE14b', 'Painel não bloqueia outra conta da equipe (409) — ela continua sem bloqueio', async () => { const r = await E('POST', `/clientes/${chefe2Id}/bloquear`, { json: {} }); return r.status === 409 && r.dados.erro === 'conta_equipe' && (await db.q('select bloqueado from usuarios where id=$1', [chefe2Id])).rows[0].bloqueado === false; });
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
  const dup = await E('POST', `/agendamentos/${ag.id}/confirmar`, { json: { dataHora: `${dias(5)}T15:00`, avisar: true } }); await sleep(300);
  await t('PE25', 'Confirmar de novo (outra pessoa/aba) → 409, horário mantido e nenhum e-mail extra', async () => dup.status === 409 && dup.dados.erro === 'ja_confirmado' && emails.length === n3 && (await req('GET', '/api/cliente/agendamentos', { cookie: cCli2 })).dados.agendamentos[0].horarioConfirmado === new Date(`${dias(5)}T10:30:00Z`).toISOString());
  const ag2 = (await req('POST', '/api/cliente/agendamentos', { cookie: cCli2, json: { assunto: 'outro', data: dias(6), formato: 'presencial', periodo: 'qualquer' } })).dados.agendamento;
  const n3b = emails.length;
  await E('POST', `/agendamentos/${ag2.id}/confirmar`, { json: { dataHora: `${dias(6)}T09:00`, avisar: false } }); await sleep(300);
  await t('PE25b', 'Confirmar com a caixa "e-mail ao cliente" desmarcada → nenhum e-mail', async () => !emails.slice(n3b).some((m) => m.to.includes('cli@example.com')));
  await t('PE26', 'Lista de pendentes fica vazia; com "todos" aparecem os confirmados', async () => (await E('GET', '/agendamentos')).dados.agendamentos.length === 0 && (await E('GET', '/agendamentos?todos=1')).dados.agendamentos.length === 2);

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

  console.log('--- Edição de dados pela equipe');
  const ed = await req('PUT', `/api/cliente/equipe/clientes/${cli}/dados`, { cookie: cChefe, json: { display_name: 'Cliente Corrigido', city: 'Abu Dhabi', CompanyName: 'Nova LLC', passportnumber: 'cd 765-4321', passportexpirationdate: '2033-03-03' } });
  await t('PE38', 'Equipe corrige nome, cidade, empresa e passaporte → 200 com a lista dos campos alterados', async () => ed.status === 200 && ['display_name', 'city', 'CompanyName', 'passportnumber', 'passportexpirationdate'].every((k) => ed.dados.alterados.includes(k)));
  const pf = (await req('GET', '/api/cliente/perfil', { cookie: cCli2 })).dados.perfil;
  await t('PE39', 'Cliente vê os dados corrigidos; passaporte normalizado e marcado como conferido pela equipe', async () => pf.display_name === 'Cliente Corrigido' && pf.city === 'Abu Dhabi' && pf.CompanyName === 'Nova LLC' && pf.passaporte === '•••• 321' && pf.passaporteValidade === '2033-03-03' && !!pf.passaporteConferidoEm && (await db.q(`select dados->>'passportnumber' n, passaporte_conferido_por por from perfis where usuario_id=$1`, [cli])).rows[0].n === 'CD7654321');
  const ruinsE = await Promise.all([{ email: 'x@y.com' }, { equipe: 'true' }, { city: 'x'.repeat(81) }, { passportnumber: '12' }, { passportexpirationdate: '2033-02-30' }, { city: 5 }].map((j) => req('PUT', `/api/cliente/equipe/clientes/${cli}/dados`, { cookie: cChefe, json: j })));
  await t('PE40', `E-mail, papel, campo longo, passaporte/validade inválidos, valor não-texto → 400 (${ruinsE.map((r) => r.status)})`, async () => ruinsE.every((r) => r.status === 400) && (await req('GET', '/api/cliente/sessao', { cookie: cCli2 })).dados.email === 'cli@example.com');
  await t('PE41', 'Cliente comum não usa a rota de edição (404); sem Origin → 403', async () => (await req('PUT', `/api/cliente/equipe/clientes/${cli}/dados`, { cookie: cOutro, json: { city: 'X' } })).status === 404 && (await req('PUT', `/api/cliente/equipe/clientes/${cli}/dados`, { cookie: cChefe, json: { city: 'X' }, headers: { Origin: 'https://evil.example' } })).status === 403);
  const igual = await req('PUT', `/api/cliente/equipe/clientes/${cli}/dados`, { cookie: cChefe, json: { city: 'Abu Dhabi' } });
  await t('PE42', 'Salvar sem mudança real → nada alterado e nada registrado', async () => igual.status === 200 && igual.dados.alterados.length === 0);
  const regEd = (await db.q(`select detalhes from acoes_equipe where acao='editar_dados' order by em`)).rows;
  await t('PE43', 'Registro guarda QUAIS campos mudaram (sem os valores)', async () => regEd.length === 1 && regEd[0].detalhes.campos.includes('city') && !JSON.stringify(regEd[0].detalhes).includes('Abu Dhabi') && !JSON.stringify(regEd[0].detalhes).includes('7654321'));

  console.log('--- Interessados (formulários do site)');
  const formCliente = { form: 'client', name: 'Lucas Interessado', email: 'Lucas@Example.com', phone: '+971 50 111 2222', client_type: 'company', company: 'Lucas Trading', country: 'Brasil', area: 'Análise de Crédito', message: 'Gostaria de conversar <script>alert(1)</script> sobre crédito.', consent: true, lang: 'en' };
  const env1 = await req('POST', '/api/contact', { json: formCliente, headers: { 'X-Real-IP': '198.51.100.50' } });
  const lead = (await db.q(`select * from interessados where email='lucas@example.com'`)).rows[0];
  await t('PE44', 'Formulário "Seja nosso cliente" enviado → 200 e o pedido fica guardado como "novo" (e-mail normalizado, mensagem intacta)', async () => env1.status === 200 && lead && lead.status === 'novo' && lead.formulario === 'cliente' && lead.idioma === 'en' && lead.empresa === 'Lucas Trading' && lead.mensagem.includes('<script>'));
  const envC = await req('POST', '/api/contact', { json: { name: 'Maria Contato', email: 'maria@example.com', subject: 'Outro assunto', message: 'Pergunta geral sobre a empresa.', consent: true, lang: 'pt' }, headers: { 'X-Real-IP': '198.51.100.51' } });
  await t('PE45', 'Formulário "Contato" também fica guardado (formulário "contato", com assunto)', async () => envC.status === 200 && (await db.q(`select formulario, assunto from interessados where email='maria@example.com'`)).rows[0]?.assunto === 'Outro assunto');
  const antesSpam = (await db.q('select count(*)::int n from interessados')).rows[0].n;
  const spam = await req('POST', '/api/contact', { json: { ...formCliente, email: 'robo@example.com', website: 'http://spam' }, headers: { 'X-Real-IP': '198.51.100.52' } });
  const invalido = await req('POST', '/api/contact', { json: { ...formCliente, email: 'sem-arroba', consent: false }, headers: { 'X-Real-IP': '198.51.100.53' } });
  await t('PE46', 'Robô (campo armadilha) e formulário inválido NÃO são guardados', async () => spam.status === 200 && invalido.status === 422 && (await db.q('select count(*)::int n from interessados')).rows[0].n === antesSpam);
  const li = (await E('GET', '/interessados?status=novo')).dados.interessados;
  await t('PE47', 'Admin lista os novos (2) e o resumo conta "interessados_novos"', async () => li.length === 2 && (await E('GET', '/resumo')).dados.interessados_novos === 2);
  await t('PE48', 'Cliente comum não vê interessados (404)', async () => (await req('GET', '/api/cliente/equipe/interessados', { cookie: cOutro })).status === 404);
  const maria = li.find((x) => x.email === 'maria@example.com');
  await t('PE49', 'Marcar como respondido → status muda; status inválido → 400', async () => (await E('POST', `/interessados/${maria.id}/status`, { json: { status: 'respondido' } })).status === 200 && (await E('POST', `/interessados/${maria.id}/status`, { json: { status: 'convidado' } })).status === 400 && (await db.q('select status, atualizado_por from interessados where id=$1', [maria.id])).rows[0].atualizado_por === 'chefe@example.com');
  const nL = emails.length;
  const conv2 = await E('POST', `/interessados/${lead.id}/convidar`, { json: {} });
  const eL = await esperar(() => emails.slice(nL).find((m) => m.to.includes('lucas@example.com') && /Client Area/.test(m.subject || '')));
  await t('PE50', 'Convidar interessado → conta criada com nome e idioma do pedido (convite em inglês), status "convidado"', async () => conv2.status === 200 && !!eL && (await db.q(`select u.idioma, p.dados->>'display_name' n from usuarios u left join perfis p on p.usuario_id=u.id where u.email='lucas@example.com'`)).rows[0].n === 'Lucas Interessado' && (await db.q('select status, usuario_id from interessados where id=$1', [lead.id])).rows[0].status === 'convidado');
  await t('PE51', 'Convidar de novo → 409 "já tem conta", sem novo e-mail', async () => { const n = emails.length; const r = await E('POST', `/interessados/${lead.id}/convidar`, { json: {} }); await sleep(300); return r.status === 409 && emails.length === n; });

  console.log('--- Registro e sessão da equipe');
  const reg = (await E('GET', '/registro')).dados.acoes.map((a) => a.acao);
  await t('PE34', `Registro guarda cada ação com quem fez (${[...new Set(reg)].join(', ')})`, async () => ['ver_ficha', 'convidar', 'reenviar', 'bloquear', 'desbloquear', 'passaporte_conferir', 'passaporte_liberar', 'confirmar_agendamento', 'aprovar_documento', 'rejeitar_documento', 'baixar_documento', 'editar_dados'].every((a) => reg.includes(a)) && (await db.q(`select count(*)::int n from acoes_equipe where por_email <> 'chefe@example.com'`)).rows[0].n === 0);
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
