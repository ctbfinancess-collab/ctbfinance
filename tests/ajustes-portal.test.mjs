// Testes dos AJUSTES do portal (passaporte editável até a conferência; pedido de agendamento pelo cliente).
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
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-ajustes-'));
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
const esperarEmail = async (fn) => { for (let i = 0; i < 50; i++) { const e = emails.find(fn); if (e) return e; await sleep(100); } return null; };

try {
  const c1 = await contaComSenha('pass@example.com', 'SenhaSegura2026');
  const c2 = await contaComSenha('outro@example.com', 'SenhaSegura2026');
  const ana = (m, r, o = {}) => req(m, r, { ...o, cookie: c1 });
  const perfil = async () => (await ana('GET', '/api/cliente/perfil')).dados.perfil;

  console.log('--- Passaporte: cliente preenche até a equipe conferir');
  const s1 = await ana('PUT', '/api/cliente/perfil', { json: { passportnumber: 'fx 123-456', passportexpirationdate: '2031-05-20' } });
  await t('PS1', 'Cliente grava número e validade (número normalizado, devolvido só mascarado)', async () => { const p = await perfil(); const doBanco = (await db.q(`select dados->>'passportnumber' n from perfis p join usuarios u on u.id=p.usuario_id where u.email='pass@example.com'`)).rows[0].n; return s1.status === 200 && p.passaporte === '•••• 456' && p.passaporteValidade === '2031-05-20' && p.passaporteConferidoEm === null && doBanco === 'FX123456' && !JSON.stringify(s1.dados).includes('FX123456'); });
  const ruins = await Promise.all([{ passportnumber: '12' }, { passportnumber: 'AB<script>' }, { passportnumber: 'A'.repeat(30) }, { passportexpirationdate: '2031-02-30' }, { passportexpirationdate: '31/12/2030' }, { passportnumber: 123456 }].map((j) => ana('PUT', '/api/cliente/perfil', { json: j })));
  await t('PS2', 'Formatos inválidos (curto, símbolos, longo, data inexistente, data BR, número não-texto) → 400 e nada muda', async () => ruins.every((r) => r.status === 400) && (await perfil()).passaporte === '•••• 456' && (await perfil()).passaporteValidade === '2031-05-20');
  await adm.conferirPassaporte('pass@example.com', 'teste');
  const bloqueado = await ana('PUT', '/api/cliente/perfil', { json: { passportnumber: 'ZZ999999', city: 'Paris' } });
  await t('PS3', 'Depois de conferido: alterar passaporte → 409 e NADA da gravação é aplicado (nem a cidade junto)', async () => { const p = await perfil(); return bloqueado.status === 409 && bloqueado.dados.erro === 'passaporte_conferido' && p.passaporte === '•••• 456' && p.city !== 'Paris' && Boolean(p.passaporteConferidoEm); });
  const outros = await ana('PUT', '/api/cliente/perfil', { json: { city: 'Dubai' } });
  await t('PS4', 'Com passaporte travado, os demais campos continuam editáveis', async () => outros.status === 200 && (await perfil()).city === 'Dubai');
  const ficha = await adm.verCliente('pass@example.com');
  await t('PS5', 'Equipe vê o número completo na ficha (usuarios:ver); a web nunca mostra', async () => ficha.dados.passportnumber === 'FX123456' && ficha.passaporteConferidoPor === 'teste');
  await adm.liberarPassaporte('pass@example.com');
  await t('PS6', 'Equipe destrava → cliente volta a poder alterar', async () => (await ana('PUT', '/api/cliente/perfil', { json: { passportnumber: 'YB7654321' } })).status === 200 && (await perfil()).passaporte === '•••• 321');
  await adm.definirDadosRestritos('outro@example.com', { passportnumber: 'gh 555 777' }, 'teste');
  await t('PS7', 'Equipe grava o passaporte de outro cliente → já fica travado para ele', async () => { const p = (await req('GET', '/api/cliente/perfil', { cookie: c2 })).dados.perfil; return p.passaporte === '•••• 777' && p.passaporteConferidoEm && (await req('PUT', '/api/cliente/perfil', { cookie: c2, json: { passportexpirationdate: '2030-01-01' } })).status === 409; });
  let erroConferir = ''; try { await adm.conferirPassaporte('v-sem@example.com'); } catch (e) { erroConferir = e.message; }
  await adm.convidar('vazio@example.com'); let erroVazio = ''; try { await adm.conferirPassaporte('vazio@example.com'); } catch (e) { erroVazio = e.message; }
  await t('PS8', 'Conferir sem número informado → erro claro para a equipe', async () => /não encontrado/.test(erroConferir) && /ainda não informou/.test(erroVazio));

  console.log('--- Pedido de agendamento pelo cliente');
  const antes = emails.length;
  const a1 = await ana('POST', '/api/cliente/agendamentos', { json: { assunto: 'investimentos', data: dias(3), formato: 'video', periodo: 'tarde', observacao: 'Prefiro à tarde <b>por vídeo</b>' } });
  await t('AG1', 'Pedido válido → 201 com data civil, sem horário', async () => a1.status === 201 && a1.dados.agendamento.dataSolicitada === dias(3) && a1.dados.agendamento.horarioConfirmado === null && a1.dados.agendamento.formato === 'video' && a1.dados.agendamento.periodo === 'tarde');
  const aviso = await esperarEmail((m, i) => /Pedido de agendamento/.test(m.subject || ''));
  await t('AG2', 'Equipe recebe aviso (para CONTACT_EMAIL_TO, responder-para o cliente, observação escapada)', async () => aviso && aviso.to.includes('equipe@exemplo.invalid') && aviso.reply_to === 'pass@example.com' && aviso.html.includes('&lt;b&gt;por vídeo&lt;/b&gt;') && !aviso.html.includes('<b>por vídeo') && /Investimentos/.test(aviso.html) && /Vídeo/.test(aviso.html) && /Tarde \(13h–18h, Dubai\)/.test(aviso.html) && emails.length > antes);
  await t('AG3', 'Aparece na lista do cliente; o outro cliente não vê', async () => { const l = (await ana('GET', '/api/cliente/agendamentos')).dados.agendamentos; const o = (await req('GET', '/api/cliente/agendamentos', { cookie: c2 })).dados.agendamentos; return l.some((x) => x.id === a1.dados.agendamento.id && x.tipo === 'investimentos' && x.descricao.includes('por vídeo')) && o.length === 0; });
  const invalidos = await Promise.all([
    { assunto: 'investimentos', data: hojeDubai() , formato: 'presencial', periodo: 'qualquer'}, { assunto: 'investimentos', data: dias(-2) , formato: 'presencial', periodo: 'qualquer'}, { assunto: 'investimentos', data: dias(181) , formato: 'presencial', periodo: 'qualquer'},
    { assunto: 'investimentos', data: '2027-02-30' , formato: 'presencial', periodo: 'qualquer'}, { assunto: 'saque', data: dias(3) , formato: 'presencial', periodo: 'qualquer'}, { assunto: 'outro', data: dias(3), formato: 'presencial', periodo: 'qualquer', observacao: 'x'.repeat(501) }, { assunto: 'outro', data: dias(3), formato: 'presencial', periodo: 'qualquer', observacao: 7 },
  ].map((j) => ana('POST', '/api/cliente/agendamentos', { json: j })));
  await t('AG4', `Hoje, passado, >180 dias, data inexistente, assunto/formato/horário fora da lista ou ausentes, observação longa/não-texto → 400 (${invalidos.map((r) => r.status).join(',')})`, async () => invalidos.every((r) => r.status === 400));
  await t('AG5', 'Sem Origin do site (CSRF) → 403; sem sessão → 401', async () => (await req('POST', '/api/cliente/agendamentos', { cookie: c1, json: { assunto: 'outro', data: dias(3) , formato: 'presencial', periodo: 'qualquer'}, headers: { Origin: 'https://evil.example' } })).status === 403 && (await req('POST', '/api/cliente/agendamentos', { json: { assunto: 'outro', data: dias(3) , formato: 'presencial', periodo: 'qualquer'} })).status === 401);
  const mais = await Promise.all([1, 2, 3, 4].map((i) => ana('POST', '/api/cliente/agendamentos', { json: { assunto: 'outro', data: dias(3 + i) , formato: 'presencial', periodo: 'qualquer'} })));
  const st = mais.map((r) => r.status).sort();
  await t('AG6', `Limite: no máximo 3 pedidos em aberto, mesmo em paralelo (${st.join(',')})`, async () => st.filter((x) => x === 201).length === 2 && st.filter((x) => x === 429).length === 2);
  const pend = await adm.listarAgendamentos();
  await adm.confirmarAgendamento(a1.dados.agendamento.id, `${dias(3)}T15:00`, 'teste');
  await t('AG7', 'Equipe lista os pendentes (agenda:listar) e confirma; o cliente vê o horário', async () => { const l = (await ana('GET', '/api/cliente/agendamentos')).dados.agendamentos; return pend.length === 3 && pend.every((x) => x.solicitado_pelo_cliente) && l.find((x) => x.id === a1.dados.agendamento.id).horarioConfirmado === new Date(`${dias(3)}T11:00:00Z`).toISOString(); });
  await t('AG8', 'Confirmado deixa de contar como "em aberto": novo pedido aceito', async () => (await ana('POST', '/api/cliente/agendamentos', { json: { assunto: 'documentos', data: dias(10) , formato: 'presencial', periodo: 'qualquer'} })).status === 201);
  await t('AG9', 'Limite diário: 5 pedidos em 24 h (o 6º é recusado mesmo com os anteriores confirmados)', async () => { for (const x of await adm.listarAgendamentos()) await adm.confirmarAgendamento(x.id, `${dias(20)}T10:00`, 't'); const quinto = (await ana('POST', '/api/cliente/agendamentos', { json: { assunto: 'outro', data: dias(11) , formato: 'presencial', periodo: 'qualquer'} })).status; for (const x of await adm.listarAgendamentos()) await adm.confirmarAgendamento(x.id, `${dias(20)}T11:00`, 't'); const sexto = (await ana('POST', '/api/cliente/agendamentos', { json: { assunto: 'outro', data: dias(12) , formato: 'presencial', periodo: 'qualquer'} })).status; return quinto === 201 && sexto === 429; });
} catch (e) {
  falhas++; console.log('❌ erro inesperado:', e);
} finally {
  console.log(`\nRESULTADO AJUSTES DO PORTAL: ${ok} corretos, ${falhas} com problema (de ${ok + falhas})`);
  srv.kill(); mock.close(); await db.fechar().catch(() => {}); await epg.stop();
  fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(falhas ? 1 : 0);
