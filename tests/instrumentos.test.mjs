// Testes dos INSTRUMENTOS FINANCEIROS (SBLC, LC, BG…): só solicitação, análise e acompanhamento. Nada é emitido,
// nenhum saldo muda. Rascunho incompleto, envio com obrigatórios, referência, isolamento, linha do tempo (notas internas
// ocultas), transições, permissão de aprovação + comprovante obrigatório, anexos, auditoria, app.
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
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-inst-'));
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
  const cAux = await contaComSenha('aux@example.com', 'SenhaSegura2026'); await adm.concederEquipe('aux@example.com');
  const cAna = await contaComSenha('ana@example.com', 'SenhaSegura2026');
  const cBia = await contaComSenha('bia@example.com', 'SenhaSegura2026');
  const ana = (await db.q(`select id from usuarios where email='ana@example.com'`)).rows[0].id;
  const E = (m, r, o = {}) => req(m, '/api/cliente/equipe' + r, { ...o, cookie: o.cookie || cChefe });
  const C = (cookie, m, r = '', json) => req(m, '/api/cliente/instrumentos' + r, { cookie, json });
  const L = async (cookie) => (await C(cookie, 'GET')).dados.solicitacoes;
  const contaAED = (await E('PUT', `/clientes/${ana}/contas`, { json: { tipo: 'digital', moeda: 'AED', saldo: '28.750,00' } })).dados.id;
  const saldoAntes = (await db.q('select saldo_centavos::text s from contas_cliente where id=$1', [contaAED])).rows[0].s;

  console.log('--- Cliente: rascunho e envio');
  await t('IN1', 'Sem solicitações → lista vazia; sem sessão → 401', async () => (await L(cAna)).length === 0 && (await req('GET', '/api/cliente/instrumentos')).status === 401);
  const r1 = await C(cAna, 'POST', '', {});
  await t('IN2', 'Rascunho vazio aceito: SBLC/USD por padrão, sem referência, faltando os obrigatórios', async () => { const s = (await L(cAna))[0]; return r1.status === 201 && s.status === 'rascunho' && s.instrumento === 'SBLC' && s.moeda === 'USD' && s.referencia === null && s.valor === null && s.faltando.includes('valor') && s.faltando.includes('beneficiarioNome'); });
  const id1 = r1.dados.solicitacao.id;
  const S1 = async () => (await L(cAna)).find((x) => x.id === id1);
  const env0 = await C(cAna, 'POST', `/${id1}/enviar`);
  await t('IN3', 'Enviar incompleto → 400 com a lista de campos obrigatórios', async () => env0.status === 400 && env0.dados.erro === 'campos_obrigatorios' && ['valor', 'beneficiarioNome', 'beneficiarioPais', 'finalidade', 'ordenante'].every((c) => env0.dados.campos.includes(c)));
  const ruins = await Promise.all([
    C(cAna, 'PUT', `/${id1}`, { instrumento: 'XYZ' }), C(cAna, 'PUT', `/${id1}`, { moeda: 'BTC' }), C(cAna, 'PUT', `/${id1}`, { valor: '-5' }),
    C(cAna, 'PUT', `/${id1}`, { valor: 'mil' }), C(cAna, 'PUT', `/${id1}`, { validade: '2026-02-31' }),
  ]);
  await t('IN4', 'Validação: instrumento, moeda, valor negativo/texto, data inexistente → 400', async () => ruins.every((r) => r.status === 400) || ruins.map((r) => r.status));
  await req('PUT', '/api/cliente/perfil', { cookie: cAna, json: { display_name: 'Ana Teste', nationality: 'Brasileira', passportnumber: 'X1234567' } });
  const ed = await C(cAna, 'PUT', `/${id1}`, { valor: '1.000.000,00', beneficiario: { nome: 'Exemplo <b>Trading</b> Ltd', pais: 'Singapura' }, finalidade: 'Garantia de pagamento de importação', ordenante: { tipo: 'pf', nome: 'Nome Forjado', identificacao: 'FORJADO1' }, validade: '2027-06-30', bancoEmissor: 'Banco Exemplo' });
  await t('IN5', 'Editar rascunho: valor 1.000.000,00 em centavos, campos gravados', async () => { const s = (await S1()); return ed.status === 200 && s.valor === '100000000' && s.beneficiario.pais === 'Singapura' && s.validade === '2027-06-30' && s.banco_emissor === 'Banco Exemplo' && s.faltando.length === 0; });
  const n0 = emails.length;
  const env1 = await C(cAna, 'POST', `/${id1}/enviar`);
  await t('IN6', 'Enviar → "enviada" com referência CTB-SBLC-AAAA-00001', async () => env1.status === 200 && env1.dados.status === 'enviada' && /^CTB-SBLC-\d{4}-00001$/.test(env1.dados.referencia));
  await t('IN7', 'Enviada: a cliente pode corrigir só mantendo completa (valor inválido → 400; sem mudança de instrumento → 409)', async () => (await C(cAna, 'PUT', `/${id1}`, { valor: 'abc' })).status === 400 && (await C(cAna, 'PUT', `/${id1}`, { instrumento: 'LC' })).status === 409);
  await sleep(500);
  await t('IN8', 'Equipe recebe e-mail com referência (texto escapado)', async () => { const m = emails.slice(n0).find((x) => /Solicitação de instrumento/.test(x.subject)); return !!m && m.to.includes('equipe@exemplo.invalid') && m.subject.includes(env1.dados.referencia) && m.html.includes('Exemplo &lt;b&gt;Trading') && !m.html.includes('<b>Trading'); });

  console.log('--- Isolamento');
  await t('IN9', 'Bia não vê nem altera a solicitação da Ana (404)', async () => (await L(cBia)).length === 0 && (await C(cBia, 'PUT', `/${id1}`, { valor: '1' })).status === 404 && (await C(cBia, 'POST', `/${id1}/cancelar`)).status === 404 && (await C(cBia, 'POST', `/${id1}/mensagens`, { texto: 'oi' })).status === 404 && (await req('POST', `/api/cliente/instrumentos/${id1}/anexos`, { cookie: cBia, corpo: PDF, headers: { 'Content-Type': 'application/pdf' } })).status === 404);
  await t('IN10', 'Cliente não acessa as rotas da equipe (404)', async () => (await req('GET', '/api/cliente/equipe/instrumentos', { cookie: cAna })).status === 404 && (await req('POST', `/api/cliente/equipe/instrumentos/${id1}/status`, { cookie: cAna, json: { status: 'aprovada' } })).status === 404);
  await t('IN11', 'Sem Origin do site → 403', async () => (await req('POST', '/api/cliente/instrumentos', { cookie: cAna, json: {}, headers: { Origin: 'https://evil.example' } })).status === 403);

  console.log('--- Anexos');
  const ax = await req('POST', `/api/cliente/instrumentos/${id1}/anexos`, { cookie: cAna, corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'contrato.pdf' } });
  await t('IN12', 'Cliente anexa PDF; aparece na solicitação e NÃO na aba Documentos', async () => { const s = (await S1()); const docs = (await req('GET', '/api/cliente/documentos', { cookie: cAna })).dados.documentos; return ax.status === 201 && s.anexos.length === 1 && s.anexos[0].nome === 'contrato.pdf' && docs.length === 0; });
  const axFalso = await req('POST', `/api/cliente/instrumentos/${id1}/anexos`, { cookie: cAna, corpo: Buffer.from('não é pdf'), headers: { 'Content-Type': 'application/pdf' } });
  await t('IN13', 'Arquivo que não confere com o tipo → 422, não vinculado', async () => axFalso.status === 422 && (await S1()).anexos.length === 1);
  await t('IN14', 'Anexos de instrumento não entram na fila de Documentos do Admin', async () => (await E('GET', '/resumo')).dados.documentos_em_analise === 0 && (await E('GET', '/documentos')).dados.documentos.length === 0);

  console.log('--- Equipe analisa');
  const lista = (await E('GET', '/instrumentos')).dados.solicitacoes;
  await t('IN15', 'Admin lista as abertas (rascunhos ficam com a cliente)', async () => lista.length === 1 && lista[0].email === 'ana@example.com' && lista[0].referencia === env1.dados.referencia);
  const r2 = await C(cAna, 'POST', '', { instrumento: 'POF' });
  await t('IN16', 'Rascunho de outra solicitação (POF, declaração) não aparece no Admin; ficha → 404', async () => r2.status === 201 && (await E('GET', '/instrumentos?status=todas')).dados.solicitacoes.length === 1 && (await E('GET', `/instrumentos/${r2.dados.solicitacao.id}`)).status === 404);
  await t('IN17', 'Filtros: instrumento=LC → 0; q=ana → 1; moeda=USD → 1', async () => (await E('GET', '/instrumentos?instrumento=LC')).dados.solicitacoes.length === 0 && (await E('GET', '/instrumentos?q=ana')).dados.solicitacoes.length === 1 && (await E('GET', '/instrumentos?moeda=USD')).dados.solicitacoes.length === 1);
  await t('IN18', 'Resumo conta 1 instrumento em aberto', async () => (await E('GET', '/resumo')).dados.instrumentos_abertos === 1);
  await t('IN19', 'Transição inválida (enviada → aguardando instituição) → 409 com mensagem', async () => { await adm.aprovadorInstrumentos('chefe@example.com', true); const r = await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'aguardando_instituicao' } }); await adm.aprovadorInstrumentos('chefe@example.com', false); return r.status === 409 && /Não é possível/.test(r.dados.mensagem); });
  await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'analise_documental' } });
  await E('POST', `/instrumentos/${id1}/mensagem`, { json: { texto: 'Nota secreta da equipe', interna: true } });
  await E('POST', `/instrumentos/${id1}/mensagem`, { json: { texto: 'Recebemos seus documentos.' } });
  await t('IN20', 'Cliente vê a mensagem e a nova situação, mas NÃO a nota interna', async () => { const s = (await S1()); const t1 = JSON.stringify(s.eventos); return s.status === 'analise_documental' && t1.includes('Recebemos seus documentos') && !t1.includes('Nota secreta'); });
  await t('IN21', 'Pedir documentos sem dizer quais → 400', async () => (await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'documentacao_solicitada' } })).status === 400);
  await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'documentacao_solicitada', texto: 'Envie o contrato comercial assinado.' } });
  const ed2 = await C(cAna, 'PUT', `/${id1}`, { observacoes: 'Contrato anexado.' });
  const troca = await C(cAna, 'PUT', `/${id1}`, { instrumento: 'BG' });
  await C(cAna, 'POST', `/${id1}/mensagens`, { texto: 'Segue o contrato.' });
  const n1 = emails.length;
  const reenv = await C(cAna, 'POST', `/${id1}/enviar`);
  await t('IN22', 'Documentação solicitada: cliente edita, não troca o instrumento, responde e reenvia → análise documental (mesma referência)', async () => ed2.status === 200 && troca.status === 409 && reenv.status === 200 && reenv.dados.status === 'analise_documental' && reenv.dados.referencia === env1.dados.referencia);
  await sleep(400);
  await t('IN23', 'Reenvio avisa a equipe', async () => emails.slice(n1).some((x) => /documentação reenviada/.test(x.subject)));
  await t('IN24', 'Responsável precisa ser da equipe; instituição registrada (nota interna)', async () => (await E('POST', `/instrumentos/${id1}/responsavel`, { json: { email: 'ana@example.com' } })).status === 400 && (await E('POST', `/instrumentos/${id1}/responsavel`, { json: { email: 'aux@example.com' } })).status === 200 && (await E('POST', `/instrumentos/${id1}/instituicao`, { json: { instituicao: 'Banco Emissor Exemplo' } })).status === 200 && (await E('GET', `/instrumentos/${id1}`)).dados.responsavel_email === 'aux@example.com' && !JSON.stringify((await S1()).eventos).includes('Banco Emissor Exemplo'));
  await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'analise_interna' } });
  await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'encaminhada' } });

  console.log('--- Aprovação: permissão + comprovante');
  const semFlag = await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'aprovada' } });
  await t('IN25', 'Sem a permissão de aprovador → 403', async () => semFlag.status === 403 && semFlag.dados.erro === 'sem_permissao');
  await adm.aprovadorInstrumentos('chefe@example.com', true);
  const semEv = await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'aprovada' } });
  await t('IN26', 'Com permissão mas sem comprovante → 409 sem_evidencia', async () => semEv.status === 409 && semEv.dados.erro === 'sem_evidencia');
  await t('IN27', 'Outra pessoa da equipe (sem permissão) também não aprova', async () => (await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'aprovada' }, cookie: cAux })).status === 403);
  const ev = await req('POST', `/api/cliente/equipe/instrumentos/${id1}/evidencias?para=aprovada`, { cookie: cChefe, corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'aprovacao-banco.pdf' } });
  const comEv = await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'aprovada' } });
  await t('IN28', 'Com permissão e comprovante → aprovada', async () => ev.status === 201 && comEv.status === 200 && (await S1()).status === 'aprovada');
  const docEv = ev.dados.documento.id;
  await t('IN29', 'Comprovante interno: cliente não vê na lista nem baixa (404); equipe baixa', async () => (await S1()).anexos.length === 1 && (await req('GET', `/api/cliente/documentos/${docEv}/arquivo`, { cookie: cAna })).status === 404 && (await req('GET', `/api/cliente/documentos/${docEv}/arquivo`, { cookie: cChefe })).status === 200);
  await t('IN30', 'Aprovada: cliente não cancela mais (409)', async () => (await C(cAna, 'POST', `/${id1}/cancelar`)).status === 409);
  await t('IN31', 'Concluir exige comprovante próprio de conclusão (409)', async () => (await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'concluida' } })).status === 409);
  await req('POST', `/api/cliente/equipe/instrumentos/${id1}/evidencias?para=concluida`, { cookie: cChefe, corpo: PDF, headers: { 'Content-Type': 'application/pdf' } });
  await t('IN32', 'Concluída com comprovante; depois é final (nada muda)', async () => (await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'concluida' } })).status === 200 && (await E('POST', `/instrumentos/${id1}/status`, { json: { status: 'cancelada', texto: 'x' } })).status === 409 && (await C(cAna, 'POST', `/${id1}/mensagens`, { texto: 'oi' })).status === 409);
  await t('IN33', 'NENHUM saldo ou extrato foi alterado', async () => (await db.q('select saldo_centavos::text s from contas_cliente where id=$1', [contaAED])).rows[0].s === saldoAntes && (await db.q('select count(*)::int n from movimentos_cliente')).rows[0].n === 0);
  await t('IN34', 'Registro guarda as ações da equipe', async () => { const a = (await E('GET', '/registro')).dados.acoes.map((x) => x.acao); return ['instrumento_analise_documental', 'instrumento_nota_interna', 'instrumento_mensagem', 'instrumento_documentacao_solicitada', 'instrumento_responsavel', 'instrumento_instituicao', 'instrumento_evidencia', 'instrumento_aprovada', 'instrumento_concluida', 'ver_instrumento'].every((x) => a.includes(x)) || a; });

  console.log('--- Cancelar, recusar, limites, app');
  const id2 = r2.dados.solicitacao.id;
  await t('IN35', 'Cliente cancela o próprio rascunho', async () => (await C(cAna, 'POST', `/${id2}/cancelar`)).status === 200 && (await L(cAna)).find((s) => s.id === id2).status === 'cancelada');
  const r3 = await C(cAna, 'POST', '', { instrumento: 'BG', moeda: 'EUR', valor: '250.000', beneficiario: { nome: 'Construtora Exemplo', pais: 'Portugal' }, finalidade: 'Garantia de execução', ordenante: { tipo: 'pf' } });
  await C(cAna, 'POST', `/${r3.dados.solicitacao.id}/enviar`);
  await t('IN36', 'Recusar sem motivo → 400; com motivo → cliente vê o motivo', async () => (await E('POST', `/instrumentos/${r3.dados.solicitacao.id}/status`, { json: { status: 'recusada' } })).status === 400 && (await E('POST', `/instrumentos/${r3.dados.solicitacao.id}/status`, { json: { status: 'recusada', texto: 'Documentação insuficiente.' } })).status === 200 && JSON.stringify((await L(cAna)).find((s) => s.id === r3.dados.solicitacao.id).eventos).includes('Documentação insuficiente.'));
  console.log('--- Ordenante (PF/PJ pelo perfil) e contrato de referência');
  const sEnv = (await req('GET', '/api/cliente/equipe/instrumentos/' + id1, { cookie: cChefe })).dados;
  await t('IN41', 'Ordenante PF: retrato montado NO SERVIDOR a partir do perfil (nome/documento enviados pelo navegador ignorados)', async () => sEnv.ordenante.tipo === 'pf' && sEnv.ordenante.nome === 'Ana Teste' && sEnv.ordenante.passaporte === 'X1234567' && !JSON.stringify(sEnv.ordenante).includes('Forjado') || sEnv.ordenante);
  await t('IN42', 'Cliente vê o passaporte do ordenante mascarado', async () => { const s = (await L(cAna)).find((x) => x.id === id1); return s.ordenante.passaporte === '•••• 567' && !JSON.stringify(s).includes('X1234567'); });
  const rPj = await C(cAna, 'POST', '', { valor: '10.000', beneficiario: { nome: 'B', pais: 'UAE' }, finalidade: 'Teste', ordenante: { tipo: 'pj' } });
  const idPj = rPj.dados.solicitacao?.id;
  const envPj = await C(cAna, 'POST', `/${idPj}/enviar`);
  const prev0 = (await C(cAna, 'GET')).dados.ordenantes;
  await t('IN43', 'PJ sem empresa no perfil → não envia ("ordenanteEmpresa"); prévia PJ vazia', async () => envPj.status === 400 && envPj.dados.campos.includes('ordenanteEmpresa') && prev0.pj === null && prev0.pf.nome === 'Ana Teste');
  await req('PUT', '/api/cliente/perfil', { cookie: cAna, json: { CompanyName: 'Ana Trading LLC', Companyregistrationnumber: 'REG-998', companycountry: 'Emirados Árabes Unidos', companyposition: 'CEO' } });
  const envPj2 = await C(cAna, 'POST', `/${idPj}/enviar`);
  const fPj = (await req('GET', '/api/cliente/equipe/instrumentos/' + idPj, { cookie: cChefe })).dados;
  await t('IN44', 'Com a empresa cadastrada em Meu perfil → envia com retrato PJ (empresa, registro, país, representante, cargo)', async () => envPj2.status === 200 && fPj.ordenante.tipo === 'pj' && fPj.ordenante.nome === 'Ana Trading LLC' && fPj.ordenante.registro === 'REG-998' && fPj.ordenante.representante === 'Ana Teste' && fPj.ordenante.cargo === 'CEO');
  await t('IN45', 'Ordenante com tipo inválido → 400', async () => (await C(cAna, 'POST', '', { ordenante: { tipo: 'xx' } })).status === 400);
  const leg = (await db.q(`insert into instrumentos_solicitacoes(usuario_id, instrumento, categoria, moeda, valor_centavos, beneficiario, ordenante, finalidade) values ($1,'SBLC','garantia','USD',100000,'{"nome":"B","pais":"UAE"}','{"nome":"Nome Antigo","identificacao":"ID-1"}','Teste') returning id`, [ana])).rows[0].id;
  const envLeg = await C(cAna, 'POST', `/${leg}/enviar`);
  await t('IN46', 'Rascunho antigo com ordenante digitado continua funcionando (envia como estava)', async () => envLeg.status === 200 && (await req('GET', '/api/cliente/equipe/instrumentos/' + leg, { cookie: cChefe })).dados.ordenante.nome === 'Nome Antigo');
  const rRef = await C(cAna, 'POST', '', {});
  const idRef = rRef.dados.solicitacao?.id;
  const up = await req('POST', `/api/cliente/instrumentos/${idRef}/anexos?tipo=contrato_referencia`, { cookie: cAna, corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'contrato-trader.pdf' } });
  const upRuim = await req('POST', `/api/cliente/instrumentos/${idRef}/anexos?tipo=qualquer`, { cookie: cAna, corpo: PDF, headers: { 'Content-Type': 'application/pdf' } });
  const sRef = (await L(cAna)).find((x) => x.id === idRef);
  await t('IN47', 'Contrato de referência anexado no RASCUNHO, marcado como "contrato_referencia"; tipo inválido → 400', async () => up.status === 201 && upRuim.status === 400 && sRef.anexos.length === 1 && sRef.anexos[0].tipo_anexo === 'contrato_referencia' && sRef.anexos[0].nome === 'contrato-trader.pdf');
  const docRef = sRef.anexos[0].id;
  await t('IN48', 'Outra cliente não remove; a própria remove enquanto é rascunho', async () => (await C(cBia, 'DELETE', `/${idRef}/anexos/${docRef}`)).status === 404 && (await C(cAna, 'DELETE', `/${idRef}/anexos/${docRef}`)).status === 200 && (await L(cAna)).find((x) => x.id === idRef).anexos.length === 0);
  const up2 = await req('POST', `/api/cliente/instrumentos/${idPj}/anexos?tipo=contrato_referencia`, { cookie: cAna, corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'contrato-navio.pdf' } });
  const fPj2 = (await req('GET', '/api/cliente/equipe/instrumentos/' + idPj, { cookie: cChefe })).dados;
  await t('IN49', 'Equipe vê o contrato de referência identificado na ficha; depois que a análise começa, a cliente não remove (409)', async () => up2.status === 201 && fPj2.anexos.some((a) => a.tipo_anexo === 'contrato_referencia' && a.nome === 'contrato-navio.pdf') && (await E('POST', `/instrumentos/${idPj}/status`, { json: { status: 'analise_documental' } })).status === 200 && (await C(cAna, 'DELETE', `/${idPj}/anexos/${fPj2.anexos[0].id}`)).status === 409);
  const refs = (await L(cAna)).map((s) => s.referencia).filter(Boolean);
  await t('IN37', 'Referências únicas por instrumento (CTB-BG-…-00002)', async () => refs.some((r) => /^CTB-BG-\d{4}-00002$/.test(r)) && new Set(refs).size === refs.length);
  const extras = []; for (let i = 0; i < 9; i++) extras.push(await C(cAna, 'POST', '', {}));
  await t('IN38', 'Limite de novas solicitações por dia → 429', async () => extras.some((r) => r.status === 429) && extras.filter((r) => r.status === 201).length <= 7);
  const lApp = await fetch(BASE + '/api/cliente/app/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana@example.com', senha: 'SenhaSegura2026' }) }).then((r) => r.json());
  await t('IN39', 'Pelo app (token), a cliente lê as mesmas solicitações', async () => { const r = await fetch(BASE + '/api/cliente/instrumentos', { headers: { Authorization: `Bearer ${lApp.token}` } }).then((x) => x.json()); return r.solicitacoes.length === (await L(cAna)).length && r.solicitacoes.length >= 3; });
  await t('IN40b', 'Ficha do cliente: filtro ?usuario= traz só as solicitações dele', async () => { const l = (await E('GET', `/instrumentos?status=todas&usuario=${ana}`)).dados.solicitacoes; const z = (await E('GET', `/instrumentos?status=todas&usuario=00000000-0000-4000-8000-000000000000`)).dados.solicitacoes; return l.length > 0 && l.every((x) => x.usuario_id === ana) && z.length === 0; });
  { // edição depois de enviada (antes da análise)
    await db.q(`update instrumentos_solicitacoes set criado_em = criado_em - interval '2 days', status = case when status in ('rascunho','enviada') then 'cancelada' else status end where usuario_id=$1`, [ana]);   // libera os limites diários/abertas para este bloco
    const e1 = (await C(cAna, 'POST', '', { instrumento: 'LC', moeda: 'USD', valor: '300.000', beneficiario: { nome: 'Fornecedor Exemplo', pais: 'Itália' }, finalidade: 'Importação', ordenante: { tipo: 'pf' } })).dados.solicitacao;
    await C(cAna, 'POST', `/${e1.id}/enviar`);
    const ed = await C(cAna, 'PUT', `/${e1.id}`, { valor: '350.000', finalidade: 'Importação de máquinas' });
    const re = await C(cAna, 'POST', `/${e1.id}/enviar`);
    const l1 = (await C(cAna, 'GET')).dados.solicitacoes.find((x) => x.id === e1.id);
    await t('IN42', 'Enviada (antes da análise): cliente edita e salva; continua "enviada", histórico registra a alteração', async () => ed.status === 200 && re.status === 200 && l1.status === 'enviada' && l1.valor === '35000000' && l1.finalidade === 'Importação de máquinas' && (l1.eventos || []).some((x) => x.texto === 'Solicitação alterada pelo cliente.'));
    const inc = await C(cAna, 'PUT', `/${e1.id}`, { finalidade: '' });
    const l2 = (await C(cAna, 'GET')).dados.solicitacoes.find((x) => x.id === e1.id);
    await t('IN43', 'Enviada: alteração que deixaria incompleta → 400 e nada muda', async () => inc.status === 400 && inc.dados.erro === 'campos_obrigatorios' && l2.finalidade === 'Importação de máquinas');
    await E('POST', `/instrumentos/${e1.id}/status`, { json: { status: 'analise_documental' } });
    await t('IN44', 'Depois que a equipe começa a análise → cliente não edita mais (409)', async () => (await C(cAna, 'PUT', `/${e1.id}`, { valor: '1' })).status === 409);
    await req('POST', `/api/cliente/equipe/instrumentos/${e1.id}/evidencias?para=aprovada`, { cookie: cChefe, corpo: PDF, headers: { 'Content-Type': 'application/pdf' } });
    const apDireto = await E('POST', `/instrumentos/${e1.id}/status`, { json: { status: 'aprovada' } });
    await t('IN45', 'Aprovadora pode marcar "Aprovada" direto de "Em análise documental" (com comprovante)', async () => apDireto.status === 200 && (await C(cAna, 'GET')).dados.solicitacoes.find((x) => x.id === e1.id).status === 'aprovada');
  }
  { const b1 = (await E('GET', '/instrumentos?status=todas&q=' + encodeURIComponent('teste ANA'))).dados.solicitacoes; const b2 = (await E('GET', '/instrumentos?status=todas&q=' + encodeURIComponent('ánã'))).dados.solicitacoes; const b3 = (await E('GET', '/instrumentos?status=todas&q=' + encodeURIComponent('ana xyz123'))).dados.solicitacoes;
    await t('IN46', 'Busca da equipe: palavras em qualquer ordem, sem acento/maiúscula ("teste ANA", "ánã" acham Ana Teste; termo inexistente não)', async () => b1.length > 0 && b1.every((x) => x.email === 'ana@example.com') && b2.length > 0 && b3.length === 0); }
  { // equipe prepara solicitação para o cliente confirmar
    const nE = emails.length;
    const prep = await E('POST', '/instrumentos', { json: { usuarioId: ana, instrumento: 'RWA', moeda: 'USD', valor: '5.000.000', beneficiario: { nome: 'Beneficiário do Pacote', pais: 'Singapura' }, finalidade: 'Incluído no pacote contratado', ordenante: { tipo: 'pf' } } }); await sleep(400);
    const eCli = emails.slice(nE).find((m) => (m.to || []).includes('ana@example.com') && /Confirme sua solicitação/.test(m.subject));
    await t('IN47', 'Equipe prepara RWA para a cliente: rascunho "preparada pela equipe" e e-mail para a cliente confirmar', async () => prep.status === 201 && prep.dados.avisado === true && !!eCli && eCli.html.includes('USD 5.000.000,00'));
    const agu = (await E('GET', '/instrumentos?status=aguardando_cliente')).dados.solicitacoes;
    await t('IN48b', 'Equipe vê a preparada em "aguardando cliente" (e nas abertas); rascunhos feitos pela própria cliente continuam invisíveis', async () => agu.some((x) => x.id === prep.dados.id && x.status === 'rascunho' && x.preparada_por === 'chefe@example.com') && (await E('GET', '/instrumentos?status=abertas')).dados.solicitacoes.some((x) => x.id === prep.dados.id) && agu.every((x) => x.preparada_por));
    const minhaP = (await C(cAna, 'GET')).dados.solicitacoes.find((x) => x.id === prep.dados.id);
    const conf = await C(cAna, 'POST', `/${prep.dados.id}/enviar`);
    const depois = (await C(cAna, 'GET')).dados.solicitacoes.find((x) => x.id === prep.dados.id);
    await t('IN49b', 'Cliente vê "preparada pela equipe", confirma → enviada com referência CTB-RWA; histórico "Confirmada pelo cliente."', async () => minhaP && minhaP.preparada_por && conf.status === 200 && /^CTB-RWA-\d{4}-\d{5}$/.test(conf.dados.referencia) && depois.status === 'enviada' && depois.eventos.some((x) => x.texto === 'Confirmada pelo cliente.'));
    const prep2 = await E('POST', '/instrumentos', { json: { usuarioId: ana, instrumento: 'SBLC', moeda: 'USD', valor: '1.000.000', ordenante: { tipo: 'pf' } } });
    const canc = await E('POST', `/instrumentos/${prep2.dados.id}/status`, { json: { status: 'cancelada', texto: 'Preparada por engano.' } });
    await t('IN50', 'Equipe cancela uma preparada ainda não confirmada; cliente inexistente → 404; sem valor → 400', async () => canc.status === 200 && (await E('POST', '/instrumentos', { json: { usuarioId: '00000000-0000-4000-8000-000000000000', instrumento: 'RWA', valor: '1' } })).status === 404 && (await E('POST', '/instrumentos', { json: { usuarioId: ana, instrumento: 'RWA' } })).status === 400);
  }
  await t('IN40', 'Servidor continua de pé', async () => vivo());
} catch (e) {
  falhas++; console.log('❌ erro inesperado:', e);
} finally {
  console.log(`\nRESULTADO INSTRUMENTOS: ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  srv.kill(); mock.close(); await db.fechar().catch(() => {}); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
