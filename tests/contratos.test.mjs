// Testes dos CONTRATOS AUTOMÁTICOS (NDA no papel timbrado): preenchimento pelo cadastro/solicitação, edição com versões,
// texto livre, liberação ao cliente, isolamento, PDF válido, via assinada, gatilho automático na aprovação, auditoria.
// Dados fictícios. Asserções do comportamento ESPERADO.
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
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-contr-'));
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
const temPdftotext = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const textoPdf = (buf) => { const f = path.join(TMP, 'x.pdf'); fs.writeFileSync(f, buf); return execFileSync('pdftotext', ['-layout', f, '-']).toString(); };
const { PDFDocument } = await import('pdf-lib');
const paginas = async (buf) => (await PDFDocument.load(buf)).getPageCount();

try {
  const cChefe = await contaComSenha('chefe@example.com', 'SenhaSegura2026'); await adm.concederEquipe('chefe@example.com');
  const cAna = await contaComSenha('ana@example.com', 'SenhaSegura2026');
  const cBia = await contaComSenha('bia@example.com', 'SenhaSegura2026');
  const ana = (await db.q(`select id from usuarios where email='ana@example.com'`)).rows[0].id;
  const bia = (await db.q(`select id from usuarios where email='bia@example.com'`)).rows[0].id;
  const E = (m, r, o = {}) => req(m, '/api/cliente/equipe' + r, { ...o, cookie: o.cookie || cChefe });
  const K = (cookie, m, r = '', o = {}) => req(m, '/api/cliente/contratos' + r, { cookie, ...o });
  const perfil = await req('PUT', '/api/cliente/perfil', { cookie: cAna, json: { display_name: 'Ana Teste', CompanyName: 'Exemplo Comércio Ltda.', Companyregistrationnumber: '12.345.678/0001-90',
    companysadress: 'Av. Exemplo', companyaddressnumber: '1000', companycity: 'São Paulo', companyzipcode: '01310-100', companycountry: 'Brasil', passportnumber: 'FZ123456' } });

  console.log('--- Modelos e configuração');
  await t('CT1', 'Modelos: NDA com os campos editáveis', async () => { const r = await E('GET', '/contratos/modelos'); return perfil.status === 200 && r.status === 200 && r.dados.modelos.some((m) => m.id === 'nda' && m.campos.some((c) => c.k === 'passaporte')); });
  const cfg = await E('PUT', '/contratos/config', { json: { nome: 'Diretor Fictício', cargo: 'EXECUTIVE DIRECTOR', pin: '120422' } });
  await t('CT2', 'Assinatura da CTB configurável (nome, cargo, PIN)', async () => cfg.status === 200 && (await E('GET', '/contratos/config')).dados.assinatura.nome === 'Diretor Fictício');

  console.log('--- Geração e preenchimento automático');
  const g = await E('POST', '/contratos', { json: { usuarioId: ana, modelo: 'nda' } });
  const c1 = g.dados;
  await t('CT3', 'Gerar NDA: rascunho CTB-NDA-AAAA-00001 preenchido com o cadastro', async () => g.status === 201 && c1.status === 'rascunho' && /^CTB-NDA-\d{4}-00001$/.test(c1.referencia)
    && c1.campos.empresa === 'Exemplo Comércio Ltda.' && c1.campos.registro === '12.345.678/0001-90' && c1.campos.endereco === 'Av. Exemplo, 1000, São Paulo, 01310-100, Brasil'
    && c1.campos.jurisdicao === 'the Federative Republic of Brazil' && c1.campos.representante === 'Ana Teste' && c1.campos.passaporte === 'FZ123456'
    && c1.campos.ctbNome === 'Diretor Fictício' && c1.campos.ctbPin === '120422' && /^\d{2}\/\d{2}\/\d{4}$/.test(c1.campos.data) && c1.campos.prazo === 'two (2)' && c1.faltando.length === 0 || c1);
  await t('CT4', 'Texto do contrato já vem com os dados (empresa, registro, endereço)', async () => c1.texto.includes('Exemplo Comércio Ltda., a company duly incorporated and existing under the laws of the Federative Republic of Brazil, registered under No. 12.345.678/0001-90') && c1.texto.includes('period of two (2) years'));
  await t('CT5', 'Rascunho é invisível ao cliente (lista vazia; PDF → 404)', async () => (await K(cAna, 'GET')).dados.contratos.length === 0 && (await K(cAna, 'GET', `/${c1.id}/pdf`)).status === 404);
  const pdf1 = await E('GET', `/contratos/${c1.id}/pdf`);
  await t('CT6', 'PDF da equipe: válido, várias páginas, timbrado, sem frase DRAFT', async () => pdf1.status === 200 && pdf1.h.get('content-type') === 'application/pdf' && pdf1.dados.subarray(0, 5).toString() === '%PDF-' && (await paginas(pdf1.dados)) > 1
    && (!temPdftotext || (() => { const t = textoPdf(pdf1.dados); return t.includes('Exemplo Comércio Ltda.') && !t.includes('DRAFT') && t.includes('Passport: FZ123456') && t.includes('Diretor Fictício - EXECUTIVE DIRECTOR'); })()));

  console.log('--- Edição e versões');
  const ed = await E('PUT', `/contratos/${c1.id}`, { json: { campos: { ...c1.campos, prazo: 'three (3)', endereco: 'Rua Nova, 50, Rio de Janeiro, Brasil' } } });
  await t('CT7', 'Editar campos → versão 2, texto atualizado, histórico com 2 versões', async () => ed.status === 200 && ed.dados.versao === 2 && ed.dados.versoes.length === 2 && ed.dados.texto.includes('period of three (3) years') && ed.dados.texto.includes('Rua Nova, 50') && !ed.dados.textoEditado);
  const livre = ed.dados.texto.replace('## 6. Intellectual Property', '## 6. Intellectual Property\n\nCláusula especial acordada entre as partes (texto de teste).');
  const ed2 = await E('PUT', `/contratos/${c1.id}`, { json: { campos: ed.dados.campos, texto: livre } });
  const pdf2 = await E('GET', `/contratos/${c1.id}/pdf`);
  await t('CT8', 'Editar o texto inteiro (exceção) → versão 3 marcada como "texto editado" e o PDF segue o texto', async () => ed2.status === 200 && ed2.dados.versao === 3 && ed2.dados.textoEditado && (!temPdftotext || textoPdf(pdf2.dados).includes('Cláusula especial acordada')));
  const ed3 = await E('PUT', `/contratos/${c1.id}`, { json: { campos: ed.dados.campos, texto: ed.dados.texto } });
  await t('CT9', 'Texto igual ao gerado pelos campos → volta a ser automático', async () => ed3.status === 200 && !ed3.dados.textoEditado && ed3.dados.versao === 4);
  const semPass = await E('PUT', `/contratos/${c1.id}`, { json: { campos: { ...ed.dados.campos, passaporte: '' } } });
  const lib0 = await E('POST', `/contratos/${c1.id}/liberar`);
  await t('CT10', 'Liberar com campo vazio → 409 com a lista (passaporte)', async () => semPass.status === 200 && lib0.status === 409 && lib0.dados.erro === 'campos_faltando' && lib0.dados.campos.includes('passaporte'));

  console.log('--- Cliente');
  await E('PUT', `/contratos/${c1.id}`, { json: { campos: ed.dados.campos } });
  const lib = await E('POST', `/contratos/${c1.id}/liberar`);
  const lista = (await K(cAna, 'GET')).dados.contratos;
  const baixa = await K(cAna, 'GET', `/${c1.id}/pdf`);
  await t('CT11', 'Liberado → cliente vê e baixa o PDF (sem selo DRAFT)', async () => lib.status === 200 && lib.dados.status === 'liberado' && lista.length === 1 && lista[0].referencia === c1.referencia && baixa.status === 200
    && /attachment/.test(baixa.h.get('content-disposition')) && (!temPdftotext || !textoPdf(baixa.dados).includes('DRAFT')));
  await t('CT12', 'Outra cliente: lista vazia e PDF da Ana → 404', async () => (await K(cBia, 'GET')).dados.contratos.length === 0 && (await K(cBia, 'GET', `/${c1.id}/pdf`)).status === 404 && (await K(cBia, 'POST', `/${c1.id}/assinado`, { corpo: PDF, headers: { 'Content-Type': 'application/pdf' } })).status === 404);
  await t('CT13', 'Cliente não acessa as rotas da equipe (404)', async () => (await req('GET', '/api/cliente/equipe/contratos', { cookie: cAna })).status === 404 && (await req('GET', `/api/cliente/equipe/contratos/${c1.id}/pdf`, { cookie: cAna })).status === 404);
  const edLib = await E('PUT', `/contratos/${c1.id}`, { json: { campos: ed.dados.campos } });
  await t('CT14', 'Editar contrato liberado → volta a rascunho e some para o cliente até nova liberação', async () => edLib.dados.status === 'rascunho' && (await K(cAna, 'GET')).dados.contratos.length === 0);
  await E('POST', `/contratos/${c1.id}/liberar`);
  const ass = await K(cAna, 'POST', `/${c1.id}/assinado`, { corpo: PDF, headers: { 'Content-Type': 'application/pdf', 'X-Nome-Arquivo': 'nda-assinado.pdf' } });
  const ass2 = await K(cAna, 'POST', `/${c1.id}/assinado`, { corpo: PDF, headers: { 'Content-Type': 'application/pdf' } });
  const docsAna = (await req('GET', '/api/cliente/documentos', { cookie: cAna })).dados.documentos;
  await t('CT15', 'Via assinada: status "assinado"; 2º envio → 409; não aparece em Documentos', async () => ass.status === 201 && ass2.status === 409 && (await K(cAna, 'GET')).dados.contratos[0].status === 'assinado' && docsAna.length === 0);
  const fichaAss = (await E('GET', `/contratos/${c1.id}`)).dados;
  await t('CT16', 'Equipe vê a via assinada e consegue baixá-la; assinado não é editável', async () => !!fichaAss.assinadoDocumentoId && (await req('GET', `/api/cliente/documentos/${fichaAss.assinadoDocumentoId}/arquivo`, { cookie: cChefe })).status === 200
    && (await E('PUT', `/contratos/${c1.id}`, { json: { campos: ed.dados.campos } })).status === 409);

  console.log('--- Automático na aprovação do instrumento');
  const s = (await req('POST', '/api/cliente/instrumentos', { cookie: cAna, json: { valor: '1.000.000,00', beneficiario: { nome: 'Beneficiário Exemplo', pais: 'Singapura' }, finalidade: 'Garantia de pagamento', ordenante: { tipo: 'pf' } } })).dados.solicitacao;
  await req('POST', `/api/cliente/instrumentos/${s.id}/enviar`, { cookie: cAna });
  for (const st of ['analise_interna', 'encaminhada']) await E('POST', `/instrumentos/${s.id}/status`, { json: { status: st } });
  await adm.aprovadorInstrumentos('chefe@example.com', true);
  await req('POST', `/api/cliente/equipe/instrumentos/${s.id}/evidencias?para=aprovada`, { cookie: cChefe, corpo: PDF, headers: { 'Content-Type': 'application/pdf' } });
  const apr = await E('POST', `/instrumentos/${s.id}/status`, { json: { status: 'aprovada' } });
  const auto = (await E('GET', `/contratos?solicitacao=${s.id}`)).dados.contratos;
  await t('CT17', 'Aprovada → NDA e Abertura de Conta criados sozinhos em RASCUNHO, ligados à solicitação (não liberados)', async () => apr.status === 200 && auto.length === 2 && auto.every((x) => x.automatico && x.status === 'rascunho') && auto.map((x) => x.modelo).sort().join(',') === 'abertura_conta,nda');
  const fa = (await E('GET', `/contratos/${auto.find((x) => x.modelo === 'nda')?.id}`)).dados;
  const fao = (await E('GET', `/contratos/${auto.find((x) => x.modelo === 'abertura_conta')?.id}`)).dados;
  await t('CT17b', 'Abertura de Conta: número de conta fixo (CTB + 12 dígitos), texto de intermediária (sem "banking company"/"custody of CTB")', async () => /^CTB\d{12}$/.test(fao.campos.conta) && /^CTB-AO-\d{4}-\d{5}$/.test(fao.referencia) && fao.texto.includes('financial brokerage and consulting company') && !/banking company|custody of CTB FINANCES|FINANCIAL INSTITUITION/.test(fao.texto));
  const s2 = (await req('POST', '/api/cliente/instrumentos', { cookie: cAna, json: { valor: '2.000.000,00', beneficiario: { nome: 'Outro Beneficiário', pais: 'Singapura' }, finalidade: 'Garantia de pagamento', ordenante: { tipo: 'pf' } } })).dados.solicitacao;
  await req('POST', `/api/cliente/instrumentos/${s2.id}/enviar`, { cookie: cAna });
  for (const st of ['analise_interna', 'encaminhada']) await E('POST', `/instrumentos/${s2.id}/status`, { json: { status: st } });
  await req('POST', `/api/cliente/equipe/instrumentos/${s2.id}/evidencias?para=aprovada`, { cookie: cChefe, corpo: PDF, headers: { 'Content-Type': 'application/pdf' } });
  await E('POST', `/instrumentos/${s2.id}/status`, { json: { status: 'aprovada' } });
  const auto2 = (await E('GET', `/contratos?solicitacao=${s2.id}`)).dados.contratos;
  await t('CT17c', 'Segunda aprovação do mesmo cliente: novo NDA, mas NÃO outra Abertura de Conta (uma por cliente)', async () => auto2.length === 1 && auto2[0].modelo === 'nda');
  await t('CT18', 'Contrato automático já preenchido (empresa, passaporte, assinatura CTB)', async () => fa.campos.empresa === 'Exemplo Comércio Ltda.' && fa.campos.passaporte === 'FZ123456' && fa.campos.ctbNome === 'Diretor Fictício' && fa.solicitacaoId === s.id);
  await t('CT19', 'Cliente não vê o rascunho automático', async () => (await K(cAna, 'GET')).dados.contratos.length === 1);
  const can = await E('POST', `/contratos/${fa.id}/cancelar`);
  await t('CT20', 'Cancelar → "cancelado"; não editável; cliente não vê', async () => can.status === 200 && can.dados.status === 'cancelado' && (await E('PUT', `/contratos/${fa.id}`, { json: { campos: fa.campos } })).status === 409 && !(await K(cAna, 'GET')).dados.contratos.some((x) => x.id === fa.id));

  const gm = await E('POST', '/contratos', { json: { usuarioId: ana, modelo: 'mandato', solicitacaoId: s.id } });
  const fm = (await E('GET', `/contratos/${gm.dados?.id}`)).dados;
  await t('CT21', 'Mandato de intermediação: puxa instrumento, valor e beneficiário da solicitação; honorários ficam para a equipe preencher; texto diz que a CTB não emite nem custodia', async () => gm.status === 201 && /^CTB-MSA-\d{4}-\d{5}$/.test(fm.referencia) && fm.campos.instrumento.startsWith('SBLC') && fm.campos.valor === 'USD 1,000,000.00' && fm.campos.beneficiario === 'Beneficiário Exemplo' && /^CTB-SBLC-\d{4}-\d{5}$/.test(fm.campos.refSolicitacao) && fm.faltando.includes('honorarioEstruturacao') && fm.texto.includes('does not issue, guarantee, confirm or transmit financial instruments'));
  const gcd = await E('POST', '/contratos', { json: { usuarioId: ana, modelo: 'cease_desist' } });
  const fcd = (await E('GET', `/contratos/${gcd.dados?.id}`)).dados;
  const pre = (await E('GET', `/contratos/${gcd.dados?.id}/preencher`)).dados;
  await t('CT22', 'Cease & Desist: nº do documento = referência; datas do NDA/Account Opening e nº da conta puxados dos contratos do cliente; só a assinatura da CTB', async () => gcd.status === 201 && /^CTB-CD-\d{4}-\d{5}$/.test(fcd.referencia) && fcd.campos.documento === fcd.referencia && /^\d{2}\/\d{2}\/\d{4}$/.test(fcd.campos.ndaData) && /^\d{2}\/\d{2}\/\d{4}$/.test(fcd.campos.aoData) && /^CTB\d{12}$/.test(fcd.campos.conta) && fcd.texto.includes('CEASE & DESIST WITH IMMEDIATE EFFECT') && pre.campos.documento === fcd.referencia);
  const gpw = await E('POST', '/contratos', { json: { usuarioId: ana, modelo: 'minuta_sblc', solicitacaoId: s.id } });
  const fpw = (await E('GET', `/contratos/${gpw.dados?.id}`)).dados;
  const pdfPw = await req('GET', `/api/cliente/equipe/contratos/${gpw.dados?.id}/pdf`, { cookie: cChefe });
  await t('CT23', 'Minuta SBLC para o banco: valor e extenso da solicitação, marca d\'água "DRAFT — NOT AN ISSUED INSTRUMENT", aviso de que não é instrumento e sem assinatura da CTB', async () => gpw.status === 201 && fpw.campos.moedaValor === 'USD 1,000,000.00' && fpw.campos.valorExtenso === 'ONE MILLION UNITED STATES DOLLARS' && fpw.texto.includes('It is NOT an issued instrument') && !fpw.texto.includes('MONEY MARKET') && !/validated and authenticated/i.test(fpw.texto) && pdfPw.status === 200
    && (!temPdftotext || (() => { const t = textoPdf(pdfPw.dados); const f = path.join(TMP, 'pw.pdf'); fs.writeFileSync(f, pdfPw.dados); const raw = execFileSync('pdftotext', ['-raw', f, '-']).toString(); return /^DRAFT/m.test(raw) && !t.includes('LICENSE No.'); })()));
  console.log('--- Isolamento, auditoria, app');
  const gBia = await E('POST', '/contratos', { json: { usuarioId: bia, modelo: 'nda', solicitacaoId: s.id } });
  await t('CT21', 'Gerar para a Bia com a solicitação da Ana → 404; modelo inexistente → 400', async () => gBia.status === 404 && (await E('POST', '/contratos', { json: { usuarioId: ana, modelo: 'sblc' } })).status === 400);
  const gBia2 = (await E('POST', '/contratos', { json: { usuarioId: bia, modelo: 'nda' } })).dados;
  await t('CT22', 'Cliente sem cadastro de empresa → campos vazios ficam para a equipe preencher (faltando)', async () => gBia2.faltando.includes('empresa') && gBia2.faltando.includes('passaporte') && gBia2.texto.includes('____'));
  console.log('DBG', gpw.status, fpw.campos?.moedaValor, fpw.campos?.valorExtenso, pdfPw.status, temPdftotext && textoPdf(pdfPw.dados).includes('DRAFT'), temPdftotext && textoPdf(pdfPw.dados).includes('LICENSE No.'));
  await t('CT23', 'Registro guarda as ações (gerado, editado, liberado, cancelado, automático, PDF)', async () => { const a = (await E('GET', '/registro')).dados.acoes.map((x) => x.acao); return ['contrato_gerado', 'contrato_editado', 'contrato_liberado', 'contrato_cancelado', 'contrato_automatico', 'contrato_pdf'].every((x) => a.includes(x)) || a; });
  await t('CT24', 'Acessos ao PDF registrados (cliente e equipe)', async () => { const r = (await db.q('select papel, count(*)::int n from contratos_acessos group by papel')).rows; return r.some((x) => x.papel === 'dono' && x.n >= 1) && r.some((x) => x.papel === 'equipe' && x.n >= 2); });
  const lApp = await fetch(BASE + '/api/cliente/app/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ana@example.com', senha: 'SenhaSegura2026' }) }).then((r) => r.json());
  await t('CT25', 'Pelo app (token), a cliente lista e baixa o contrato liberado', async () => { const h = { Authorization: `Bearer ${lApp.token}` }; const l = await fetch(BASE + '/api/cliente/contratos', { headers: h }).then((x) => x.json()); const p = await fetch(BASE + `/api/cliente/contratos/${c1.id}/pdf`, { headers: h }); return l.contratos.length === 1 && p.status === 200; });
  if (process.env.AMOSTRA_PDF) { const p = await E('GET', `/contratos/${c1.id}/pdf`); fs.writeFileSync(process.env.AMOSTRA_PDF, p.dados); }
  await t('CT26', 'Servidor continua de pé', async () => vivo());
} catch (e) {
  falhas++; console.log('❌ erro inesperado:', e);
} finally {
  console.log(`\nRESULTADO CONTRATOS: ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  srv.kill(); mock.close(); await db.fechar().catch(() => {}); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
