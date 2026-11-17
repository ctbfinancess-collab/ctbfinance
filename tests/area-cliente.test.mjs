// Testes da Área do Cliente no Railway: servidor REAL do site (server.mjs) + Postgres REAL (embedded-postgres 17)
// + volume em pasta temporária + servidor falso no lugar do Resend (captura os e-mails). Dados fictícios.
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
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-area-'));
const ARQ = path.join(TMP, 'volume');
const [PG, PORTA, MOCK] = [await livre(), await livre(), await livre()];

// ---- Postgres real
const epg = new EmbeddedPostgres({ databaseDir: path.join(TMP, 'pg'), user: 'ctb', password: 'teste-local', port: PG, persistent: false, onLog: () => {} });
await epg.initialise(); await epg.start(); await epg.createDatabase('ctb_area');
const DATABASE_URL = `postgres://ctb:teste-local@127.0.0.1:${PG}/ctb_area`;

// ---- Resend falso: guarda os e-mails
const emails = [];
const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { emails.push(JSON.parse(b)); } catch {} res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"id":"teste"}'); }); });
await new Promise((ok) => mock.listen(MOCK, '127.0.0.1', ok));

const BASE = `http://127.0.0.1:${PORTA}`;
Object.assign(process.env, { DATABASE_URL, ARQUIVOS_DIR: ARQ, RESEND_API_KEY: 'teste', RESEND_API_BASE: `http://127.0.0.1:${MOCK}`, CONTACT_EMAIL_TO: 'equipe@exemplo.invalid', AREA_COOKIE_INSEGURO: '1', AREA_SITE_URL: BASE });
const srv = spawn(process.execPath, ['server.mjs'], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA) }, stdio: ['ignore', 'pipe', 'pipe'] });
let logSrv = ''; srv.stdout.on('data', (d) => (logSrv += d)); srv.stderr.on('data', (d) => (logSrv += d));
for (let i = 0; i < 100 && !/porta/.test(logSrv); i++) await sleep(100);

// ---- operações da equipe (mesmos módulos do script ctb-admin)
const { criarBanco, criarArquivos } = await import('../server/area/nucleo.mjs');
const { criarApi } = await import('../server/area/api.mjs');
const { criarAdmin } = await import('../server/area/admin.mjs');
const { enviarEmailAcesso } = await import('../server/area/emails.mjs');
const db = criarBanco(DATABASE_URL); const arquivos = criarArquivos(ARQ);
const adm = criarAdmin({ db, arquivos, api: criarApi({ db, arquivos, origens: new Set(), enviarEmail: enviarEmailAcesso, siteUrl: BASE }) });

// ---- cliente HTTP com cookie por pessoa
const ORIGIN = BASE;
function cliente() {
  let cookie = null;
  const f = async (metodo, rota, { json, corpo, headers = {}, origem = ORIGIN } = {}) => {
    const h = { ...headers }; if (cookie) h.Cookie = cookie; if (origem) h.Origin = origem;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; corpo = JSON.stringify(json); }
    const r = await fetch(BASE + rota, { method: metodo, headers: h, body: corpo });
    const sc = r.headers.get('set-cookie'); if (sc) { const v = sc.split(';')[0]; cookie = /=$/.test(v) ? null : v; f.ultimoSetCookie = sc; }
    const tipo = r.headers.get('content-type') || '';
    const dados = tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, dados, h: r.headers };
  };
  f.cookie = () => cookie; f.definirCookie = (c) => (cookie = c);
  return f;
}
const linkDe = (to, tipo) => { const e = [...emails].reverse().find((m) => m.to.includes(to)); const m = e && e.text.match(new RegExp(`[?&]${tipo}=([A-Za-z0-9_-]+)`)); return m ? m[1] : null; };
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
let ok = 0, falhas = 0;
async function t(id, desc, fn) { try { const r = await fn(); if (r !== true) throw new Error('condição não atendida' + (r && r !== false ? ' ' + JSON.stringify(r).slice(0, 160) : '')); ok++; console.log(`✅ ${id} ${desc}`); } catch (e) { falhas++; console.log(`❌ ${id} ${desc} → ${String(e.message).slice(0, 200)}`); } }

const ana = cliente(), bruno = cliente(), analista = cliente(), anon = cliente();
try {
  console.log('--- Acesso (convite, senha, sessão)');
  await t('C01', 'Status: Área do Cliente ativa (banco + volume configurados)', async () => (await anon('GET', '/api/cliente/status')).dados.ativo === true);
  await adm.convidar('ana@example.com', { nome: 'Ana Teste' }); await adm.convidar('bruno@example.com', { nome: 'Bruno Teste' }); await adm.convidar('analista@ctbfinances.ae', { nome: 'Analista' });
  await t('C02', 'Convite enviado pelo Resend com link de uso único (72 h)', async () => Boolean(linkDe('ana@example.com', 'convite')) && emails.some((m) => m.subject.includes('Seu acesso à Área do Cliente')));
  const convAna = linkDe('ana@example.com', 'convite');
  await t('C03', 'Senha fraca é recusada (curta / sem número / parecida com o e-mail)', async () => (await ana('POST', '/api/cliente/redefinir', { json: { token: convAna, senha: 'curta1' } })).dados.erro === 'senha_curta' && (await ana('POST', '/api/cliente/redefinir', { json: { token: convAna, senha: 'somenteletras' } })).dados.erro === 'senha_fraca' && (await ana('POST', '/api/cliente/redefinir', { json: { token: convAna, senha: 'ana12345678' } })).dados.erro === 'senha_parecida_email');
  await t('C04', 'Convite aceito: senha criada e sessão aberta (cookie HttpOnly, SameSite=Strict, Path=/api/cliente)', async () => { const r = await ana('POST', '/api/cliente/redefinir', { json: { token: convAna, senha: 'SenhaForte2026' } }); return r.status === 200 && /HttpOnly/.test(ana.ultimoSetCookie) && /SameSite=Strict/.test(ana.ultimoSetCookie) && /Path=\/api\/cliente/.test(ana.ultimoSetCookie) && !/Max-Age/.test(ana.ultimoSetCookie); });
  await t('C05', 'Link do convite usado de novo → inválido', async () => (await anon('POST', '/api/cliente/redefinir', { json: { token: convAna, senha: 'OutraSenha2026' } })).dados.erro === 'link_invalido');
  const cb = await bruno('POST', '/api/cliente/redefinir', { json: { token: linkDe('bruno@example.com', 'convite'), senha: 'ChaveSegura2026' } });
  const cs = await analista('POST', '/api/cliente/redefinir', { json: { token: linkDe('analista@ctbfinances.ae', 'convite'), senha: 'Revisao2026Forte' } });
  if (cb.status !== 200 || cs.status !== 200) throw new Error('convites de Bruno/analista não aceitos: ' + JSON.stringify([cb.dados, cs.dados]));
  await t('C06', 'Senha errada e e-mail inexistente recebem a MESMA resposta (401)', async () => { const a = await anon('POST', '/api/cliente/entrar', { json: { email: 'ana@example.com', senha: 'errada123456' } }); const b = await anon('POST', '/api/cliente/entrar', { json: { email: 'ninguem@example.com', senha: 'errada123456' } }); return a.status === 401 && b.status === 401 && a.dados.erro === b.dados.erro; });
  const outra = cliente();
  await t('C07', 'Entrar com a senha certa abre sessão', async () => (await outra('POST', '/api/cliente/entrar', { json: { email: 'ana@example.com', senha: 'SenhaForte2026' } })).status === 200 && (await outra('GET', '/api/cliente/sessao')).dados.email === 'ana@example.com');
  for (let i = 0; i < 5; i++) await anon('POST', '/api/cliente/entrar', { json: { email: 'bruno@example.com', senha: 'tentativa' + i + 'x9' } });
  await t('C08', 'Após 5 erros no mesmo e-mail: bloqueio temporário (429), até com a senha certa', async () => (await anon('POST', '/api/cliente/entrar', { json: { email: 'bruno@example.com', senha: 'ChaveSegura2026' } })).status === 429);
  await t('C09', 'Encerrar sessão: o MESMO cookie deixa de valer na hora', async () => { const c = outra.cookie(); await outra('POST', '/api/cliente/sair'); const x = cliente(); x.definirCookie(c); return (await x('GET', '/api/cliente/sessao')).status === 401; });
  await t('C10', 'Cookie forjado → 401', async () => { const x = cliente(); x.definirCookie('ctb_sessao=' + crypto.randomBytes(32).toString('base64url')); return (await x('GET', '/api/cliente/perfil')).status === 401; });
  await t('C11', 'Pedido que altera dados SEM Origin ou com Origin de outro site → 403 (proteção CSRF)', async () => (await ana('PUT', '/api/cliente/perfil', { json: { city: 'X' }, origem: null })).status === 403 && (await ana('PUT', '/api/cliente/perfil', { json: { city: 'X' }, origem: 'https://site-malicioso.example' })).status === 403);
  const antes = emails.length;
  await t('C12', 'Esqueci a senha: mesma resposta para conta existente e inexistente; e-mail só para a existente', async () => { const a = await anon('POST', '/api/cliente/esqueci', { json: { email: 'ana@example.com' } }); const b = await anon('POST', '/api/cliente/esqueci', { json: { email: 'naoexiste@example.com' } }); return a.status === 200 && b.status === 200 && JSON.stringify(a.dados) === JSON.stringify(b.dados) && emails.length === antes + 1 && emails[emails.length - 1].to.includes('ana@example.com'); });
  const sessaoAntiga = cliente(); await sessaoAntiga('POST', '/api/cliente/entrar', { json: { email: 'ana@example.com', senha: 'SenhaForte2026' } });
  const red = linkDe('ana@example.com', 'redefinir');
  await t('C13', 'Redefinir senha: funciona uma vez e ENCERRA as outras sessões abertas', async () => { const r = await ana('POST', '/api/cliente/redefinir', { json: { token: red, senha: 'NovaSenha2026x' } }); const reuso = await anon('POST', '/api/cliente/redefinir', { json: { token: red, senha: 'OutraSenha2026' } }); return r.status === 200 && reuso.dados.erro === 'link_invalido' && (await sessaoAntiga('GET', '/api/cliente/sessao')).status === 401 && (await ana('GET', '/api/cliente/sessao')).status === 200; });
  await anon('POST', '/api/cliente/esqueci', { json: { email: 'bruno@example.com' } });
  const redB = linkDe('bruno@example.com', 'redefinir');
  await db.q(`update tokens_senha set expira_em = now() - interval '1 minute' where hash=$1`, [crypto.createHash('sha256').update(redB).digest('hex')]);
  await t('C14', 'Link de redefinição vencido (1 h) → inválido', async () => (await anon('POST', '/api/cliente/redefinir', { json: { token: redB, senha: 'ChaveSegura2027' } })).dados.erro === 'link_invalido');
  await db.q(`delete from tentativas_login`);
  await bruno('POST', '/api/cliente/entrar', { json: { email: 'bruno@example.com', senha: 'ChaveSegura2026' } });
  const ociosa = cliente(); await ociosa('POST', '/api/cliente/entrar', { json: { email: 'bruno@example.com', senha: 'ChaveSegura2026' } });
  await db.q(`update sessoes set ultimo_uso_em = now() - interval '3 hours' where id_hash=$1`, [crypto.createHash('sha256').update(ociosa.cookie().split('=')[1]).digest('hex')]);
  await t('C15', 'Sessão parada há mais de 2 h expira', async () => (await ociosa('GET', '/api/cliente/sessao')).status === 401);

  console.log('--- Perfil');
  await adm.definirDadosRestritos('ana@example.com', { passportnumber: 'FX123456' });
  await t('P01', 'Ana vê o próprio perfil (nome do convite) e o passaporte mascarado', async () => { const r = (await ana('GET', '/api/cliente/perfil')).dados; return r.email === 'ana@example.com' && r.perfil.display_name === 'Ana Teste' && r.perfil.passaporte === '•••• 456' && !JSON.stringify(r).includes('FX123456'); });
  await t('P02', 'Ana altera cidade e empresa', async () => { const r = await ana('PUT', '/api/cliente/perfil', { json: { city: 'Dubai', CompanyName: 'Ana Trading LLC' } }); return r.status === 200 && r.dados.perfil.city === 'Dubai'; });
  await t('P03', 'Campos fora da lista (e-mail, passaporte, saldo, papel) são recusados e nada muda', async () => { const rs = await Promise.all([{ email: 'x@y.z' }, { passportnumber: '1' }, { Balance: '9' }, { equipe: 'true' }].map((j) => ana('PUT', '/api/cliente/perfil', { json: j }))); const p = (await ana('GET', '/api/cliente/perfil')).dados; return rs.every((r) => r.status === 400) && p.email === 'ana@example.com' && p.perfil.passaporte === '•••• 456'; });
  await t('P04', 'Valor maior que o limite → 400', async () => (await ana('PUT', '/api/cliente/perfil', { json: { city: 'x'.repeat(81) } })).status === 400);
  await t('P05', 'Bruno vê só o perfil dele (nada da Ana)', async () => { const r = JSON.stringify((await bruno('GET', '/api/cliente/perfil')).dados); return r.includes('Bruno Teste') && !/Ana|Dubai|456/.test(r); });

  console.log('--- Documentos');
  const up = (quem, buf, tipo, nome) => quem('POST', '/api/cliente/documentos', { corpo: buf, headers: { 'Content-Type': tipo, 'X-Nome-Arquivo': encodeURIComponent(nome) } });
  const r1 = await up(ana, PDF, 'application/pdf', 'passaporte.pdf');
  const docAna = r1.dados.documento;
  await t('D01', 'Ana envia PDF válido → "disponivel_analise"; arquivo gravado no volume (fora da pasta pública)', async () => r1.status === 201 && docAna.status === 'disponivel_analise' && fs.readdirSync(path.join(ARQ, 'docs')).length === 1 && !fs.existsSync(path.join(RAIZ, 'dist', 'docs')));
  const nArq = fs.readdirSync(path.join(ARQ, 'docs')).length;
  const r2 = await up(ana, Buffer.from('ABC'), 'application/pdf', 'falso.pdf');
  await t('D02', 'Conteúdo falso declarado como PDF → "rejeitado" com orientação PT/EN; nada fica no volume', async () => r2.status === 422 && r2.dados.documento.status === 'rejeitado' && /Exporte o documento novamente/.test(r2.dados.documento.orientacao.pt) && fs.readdirSync(path.join(ARQ, 'docs')).length === nArq && fs.readdirSync(path.join(ARQ, 'tmp')).length === 0);
  await t('D03', 'Formato não aceito (SVG) → 415', async () => (await up(ana, Buffer.from('<svg/>'), 'image/svg+xml', 'x.svg')).status === 415);
  await t('D04', 'Arquivo de 11 MB → 413 e nada gravado', async () => (await up(ana, Buffer.alloc(11 * 1024 * 1024), 'application/pdf', 'grande.pdf')).status === 413 && fs.readdirSync(path.join(ARQ, 'tmp')).length === 0);
  await t('D05', 'Arquivo vazio → recusado', async () => (await up(ana, Buffer.alloc(0), 'application/pdf', 'vazio.pdf')).status === 400);
  const r3 = await up(ana, PDF, 'application/pdf', '../../etc/passwd');
  await t('D06', 'Nome malicioso ("../../etc/passwd") é saneado; o arquivo é guardado por chave aleatória', async () => r3.status === 201 && !r3.dados.documento.nome.includes('/') && fs.readdirSync(path.join(ARQ, 'docs')).every((n) => /^[0-9a-f-]{36}$/.test(n)));
  await up(bruno, PDF, 'application/pdf', 'contrato-bruno.pdf');
  await t('D07', 'Lista da Ana tem só os documentos dela; a do Bruno só o dele', async () => { const a = (await ana('GET', '/api/cliente/documentos')).dados.documentos.map((d) => d.nome); const b = (await bruno('GET', '/api/cliente/documentos')).dados.documentos.map((d) => d.nome); return a.includes('passaporte.pdf') && !a.includes('contrato-bruno.pdf') && b.length === 1 && b[0] === 'contrato-bruno.pdf'; });
  await t('D08', 'Ana baixa o próprio documento: mesmos bytes, no-store, anexo, nosniff', async () => { const r = await ana('GET', `/api/cliente/documentos/${docAna.id}/arquivo`); return r.status === 200 && Buffer.from(r.dados).equals(PDF) && /no-store/.test(r.h.get('cache-control')) && /attachment/.test(r.h.get('content-disposition')) && r.h.get('x-content-type-options') === 'nosniff'; });
  await t('D09', 'Bruno tenta baixar o documento da Ana → 404 (não revela que existe); sem login → 401', async () => (await bruno('GET', `/api/cliente/documentos/${docAna.id}/arquivo`)).status === 404 && (await anon('GET', `/api/cliente/documentos/${docAna.id}/arquivo`)).status === 401);
  await t('D10', 'Documento rejeitado tecnicamente não é baixável (409)', async () => (await ana('GET', `/api/cliente/documentos/${r2.dados.documento.id}/arquivo`)).status === 409);
  await t('D11', 'Nenhum caminho público expõe o volume (/docs, /tmp, /arquivos, chave direta)', async () => { const chave = fs.readdirSync(path.join(ARQ, 'docs'))[0]; const rs = await Promise.all([`/docs/${chave}`, `/arquivos/docs/${chave}`, `/tmp/x`, `/${chave}`, `/api/cliente/../docs/${chave}`].map((p) => fetch(BASE + p).then((r) => r.status))); return rs.every((s) => s === 404); });
  await adm.concederEquipe('analista@ctbfinances.ae');
  await t('D12', 'Equipe ativa baixa o documento da Ana (registrado em acessos_documentos)', async () => (await analista('GET', `/api/cliente/documentos/${docAna.id}/arquivo`)).status === 200 && (await db.q(`select count(*)::int n from acessos_documentos where papel='equipe'`)).rows[0].n === 1);
  await adm.revogarEquipe('analista@ctbfinances.ae');
  await t('D13', 'Equipe REVOGADA: a MESMA sessão perde o acesso na hora', async () => (await analista('GET', `/api/cliente/documentos/${docAna.id}/arquivo`)).status === 404);
  await adm.decidir(docAna.id, 'aprovado', { por: 'analista' });
  const docB = (await bruno('GET', '/api/cliente/documentos')).dados.documentos[0];
  await adm.decidir(docB.id, 'rejeitado', { orientacaoPt: 'Documento ilegível. Envie uma digitalização nítida.', orientacaoEn: 'Unreadable document.', por: 'analista' });
  await t('D14', 'Decisões da equipe aparecem para o cliente (aprovado; rejeitado com orientação e ainda baixável)', async () => { const a = (await ana('GET', '/api/cliente/documentos')).dados.documentos.find((d) => d.id === docAna.id); const b = (await bruno('GET', '/api/cliente/documentos')).dados.documentos[0]; return a.status === 'aprovado' && b.status === 'rejeitado' && b.orientacao.pt.includes('ilegível') && b.baixavel === true && (await bruno('GET', `/api/cliente/documentos/${b.id}/arquivo`)).status === 200; });
  await t('D15', 'Decisão já tomada não pode ser refeita; rejeição sem orientação é recusada', async () => { let x = false, y = false; try { await adm.decidir(docAna.id, 'rejeitado', { orientacaoPt: 'x' }); } catch { x = true; } try { await adm.decidir(r3.dados.documento.id, 'rejeitado', {}); } catch { y = true; } return x && y; });
  fs.writeFileSync(path.join(ARQ, 'docs', crypto.randomUUID()), 'orfao'); fs.writeFileSync(path.join(ARQ, 'tmp', 'parcial'), 'x');
  await t('D16', 'Conferência de arquivos: simulação só relata; aplicar apaga órfãos/temporários antigos; registros íntegros', async () => { const s = await adm.reconciliarArquivos({ aplicar: false, idadeMinMs: 0 }); const a = await adm.reconciliarArquivos({ aplicar: true, idadeMinMs: 0 }); const d = await adm.reconciliarArquivos({ aplicar: true, idadeMinMs: 0 }); return s.orfaosApagados.length === 1 && s.temporariosApagados.length === 1 && a.orfaosApagados.length === 1 && d.orfaosApagados.length === 0 && d.registrosSemArquivo.length === 0 && (await ana('GET', `/api/cliente/documentos/${docAna.id}/arquivo`)).status === 200; });

  console.log('--- Agendamentos');
  const ag = await adm.registrarAgendamento('ana@example.com', '2026-11-25', 'Abertura de conta');
  const ag2 = await adm.registrarAgendamento('ana@example.com', '2026-11-27', 'Revisão de documentos');
  await adm.confirmarAgendamento(ag2.id, '2026-11-27T14:00', 'analista');
  await t('A01', 'Pedido: só a data civil "2026-11-25" (sem hora)', async () => { const l = (await ana('GET', '/api/cliente/agendamentos')).dados.agendamentos; const x = l.find((a) => a.id === ag.id); return x.dataSolicitada === '2026-11-25' && x.horarioConfirmado === null; });
  await t('A02', 'Confirmado 27/11 14:00 em Dubai = 10:00 UTC', async () => { const l = (await ana('GET', '/api/cliente/agendamentos')).dados.agendamentos; return new Date(l.find((a) => a.id === ag2.id).horarioConfirmado).toISOString() === '2026-11-27T10:00:00.000Z'; });
  await t('A03', 'Bruno não vê os agendamentos da Ana', async () => (await bruno('GET', '/api/cliente/agendamentos')).dados.agendamentos.length === 0);

  console.log('--- Bloqueio e configurações');
  await adm.bloquear('bruno@example.com');
  await t('B01', 'Cliente bloqueado: a sessão aberta cai na hora e o login é recusado', async () => (await bruno('GET', '/api/cliente/perfil')).status === 401 && (await anon('POST', '/api/cliente/entrar', { json: { email: 'bruno@example.com', senha: 'ChaveSegura2026' } })).status === 401);
  await t('B02', 'Todas as respostas da API trazem Cache-Control: no-store', async () => /no-store/.test((await ana('GET', '/api/cliente/perfil')).h.get('cache-control')) && /no-store/.test((await anon('GET', '/api/cliente/sessao')).h.get('cache-control')));
  await t('B03', 'No banco: senhas só como hash scrypt; sessões e links só como hash', async () => { const u = (await db.q(`select senha_hash from usuarios where email='ana@example.com'`)).rows[0]; const s = (await db.q('select id_hash from sessoes limit 1')).rows[0]; return u.senha_hash.startsWith('scrypt$') && !u.senha_hash.includes('NovaSenha') && /^[0-9a-f]{64}$/.test(s.id_hash); });
  const P2 = await livre();
  const semBanco = spawn(process.execPath, ['server.mjs'], { cwd: RAIZ, env: { PATH: process.env.PATH, PORT: String(P2) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let l2 = ''; semBanco.stdout.on('data', (d) => (l2 += d)); for (let i = 0; i < 100 && !/porta/.test(l2); i++) await sleep(100);
  await t('B04', 'Sem DATABASE_URL/ARQUIVOS_DIR: área desativada ("ativo": false) e demais rotas 503 — site publicado hoje fica igual', async () => { const s = await (await fetch(`http://127.0.0.1:${P2}/api/cliente/status`)).json(); const e = await fetch(`http://127.0.0.1:${P2}/api/cliente/entrar`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${P2}` } }); return s.ativo === false && e.status === 503; });
  semBanco.kill();
} finally {
  console.log(`\nRESULTADO ÁREA DO CLIENTE (Railway): ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  srv.kill(); mock.close(); await db.fechar(); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
  if (falhas) { console.log('--- log do servidor ---\n' + logSrv.slice(-3000)); process.exitCode = 1; }
}
