// Navegador REAL (Chrome headless) + servidor do site + Postgres REAL + volume temporário + Resend falso.
// PAINEL DA EQUIPE no navegador. Dados fictícios.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const RAIZ = path.resolve(new URL('..', import.meta.url).pathname);
const TMP = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'ctb-navpainel-'));
const SAIDA = process.env.TELAS_DIR || TMP;
const livre = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [PG, PORTA, MOCK, CDP] = [await livre(), await livre(), await livre(), await livre()];
const epg = new EmbeddedPostgres({ databaseDir: path.join(TMP, 'pg'), user: 'ctb', password: 'teste-local', port: PG, persistent: false, onLog: () => {} });
await epg.initialise(); await epg.start(); await epg.createDatabase('ctb_area');
const emails = [];
const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { emails.push(JSON.parse(b)); } catch {} res.end('{"id":"x"}'); }); });
await new Promise((ok) => mock.listen(MOCK, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${PORTA}`;
Object.assign(process.env, { DATABASE_URL: `postgres://ctb:teste-local@127.0.0.1:${PG}/ctb_area`, ARQUIVOS_DIR: path.join(TMP, 'volume'), RESEND_API_KEY: 'teste', RESEND_API_BASE: `http://127.0.0.1:${MOCK}`, CONTACT_EMAIL_TO: 'equipe@exemplo.invalid', AREA_COOKIE_INSEGURO: '1', AREA_SITE_URL: BASE });
const srv = spawn(process.execPath, ['server.mjs'], { cwd: RAIZ, env: { ...process.env, PORT: String(PORTA) }, stdio: ['ignore', 'pipe', 'pipe'] });
let logSrv = ''; srv.stdout.on('data', (d) => (logSrv += d)); srv.stderr.on('data', (d) => (logSrv += d));
for (let i = 0; i < 100 && !/porta/.test(logSrv); i++) await sleep(100);

const { criarBanco, criarArquivos } = await import('../server/area/nucleo.mjs');
const { criarApi } = await import('../server/area/api.mjs');
const { criarAdmin } = await import('../server/area/admin.mjs');
const { enviarEmailAcesso } = await import('../server/area/emails.mjs');
const db = criarBanco(process.env.DATABASE_URL); const arquivos = criarArquivos(process.env.ARQUIVOS_DIR);
const adm = criarAdmin({ db, arquivos, api: criarApi({ db, arquivos, origens: new Set(), enviarEmail: enviarEmailAcesso, siteUrl: BASE }) });
const sessaoDe = async (email, senha) => (await fetch(`${BASE}/api/cliente/entrar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email, senha }) })).headers.get('set-cookie').split(';')[0];
const tok = (to) => { const e = [...emails].reverse().find((m) => m.to.includes(to)); return (e.text.match(/[?&](?:convite|redefinir)=([A-Za-z0-9_-]+)/) || [])[1]; };
async function conta(email, senha) { await adm.convidar(email); await fetch(`${BASE}/api/cliente/redefinir`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ token: tok(email), senha }) }); return sessaoDe(email, senha); }
const put = (c, rota, metodo, corpo, tipo = 'application/json', extra = {}) => fetch(BASE + rota, { method: metodo, headers: { Cookie: c, Origin: BASE, 'Content-Type': tipo, ...extra }, body: tipo === 'application/json' ? JSON.stringify(corpo) : corpo }).then((r) => r.json());
const hojeDubai = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
const dias = (n) => { const d = new Date(hojeDubai() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// dados fictícios
await conta('chefe@example.com', 'Painel2026Seguro'); await adm.concederEquipe('chefe@example.com');
const cAna = await conta('ana@example.com', 'Cliente2026Xyz');
await put(cAna, '/api/cliente/perfil', 'PUT', { display_name: '<img src=x onerror="window.__xss=1">Ana Teste', phone_number: '+971 50 000 0000', city: 'Dubai', passportnumber: 'FX1234567', passportexpirationdate: '2031-05-20' });
await put(cAna, '/api/cliente/documentos', 'POST', Buffer.from('%PDF-1.4 passaporte\n%%EOF\n'), 'application/pdf', { 'X-Nome-Arquivo': 'passaporte-ana.pdf' });
await put(cAna, '/api/cliente/documentos', 'POST', Buffer.from('%PDF-1.4 comprovante\n%%EOF\n'), 'application/pdf', { 'X-Nome-Arquivo': 'comprovante.pdf' });
await put(cAna, '/api/cliente/agendamentos', 'POST', { assunto: 'abertura_conta', data: dias(4), formato: 'video', periodo: 'manha', observacao: 'Aguardo contato' });
await conta('bruno@example.com', 'Outra2026Conta');

const ch = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${CDP}`, `--user-data-dir=${fs.mkdtempSync(path.join(TMP, 'chrome-'))}`, 'about:blank'], { stdio: 'ignore' });
let alvo; for (let i = 0; i < 150; i++) { try { alvo = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(alvo.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(100); } return false; };
const vis = (sel) => `(()=>{const e=document.querySelector('${sel}');return !!e && !e.hidden && e.getClientRects().length>0})()`;
const shot = async (f, w = 1440, h = 1000) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 }); await sleep(400); const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SAIDA, `${f}.png`), Buffer.from(data, 'base64')); };
let ok = 0, fail = 0; const check = (d, c) => { if (c) { ok++; console.log('✅', d); } else { fail++; console.log('❌', d); } };
const clicar = (sel) => ev(`(()=>{const e=document.querySelector('${sel}');e.click();return 1})()`);
const clicarTexto = (txt, raiz = 'document') => ev(`(()=>{const b=[...${raiz}.querySelectorAll('button')].find(x=>x.textContent.trim()==='${txt}' && x.getClientRects().length);if(!b)return 0;b.click();return 1})()`);
const entrarPainel = (e, s) => ev(`(()=>{const f=document.querySelector('[data-form-entrar]');f.email.value='${e}';f.senha.value='${s}';f.requestSubmit();return 1})()`);
const msg = `((document.querySelector('[data-msg]')||{}).textContent||'')`;

try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Sao_Paulo' });
  console.log('--- Acesso');
  await send('Page.navigate', { url: BASE + '/painel/' });
  check('Sem sessão: tela "Painel da equipe" para entrar', await waitFor(vis('[data-vista="entrar"]')));
  check('Página fora dos buscadores (noindex)', await ev(`document.querySelector('meta[name=robots]').content.includes('noindex')`));
  await entrarPainel('bruno@example.com', 'Outra2026Conta');
  check('Cliente comum entra → "Esta conta não tem acesso"; o painel não abre e a Área do Cliente dele continua conectada', await waitFor(`(document.querySelector('[data-msg-entrar]')||{}).textContent?.includes('não tem acesso')`) && !(await ev(`!document.querySelector('[data-vista="painel"]').hidden`)) && (await ev(`fetch('/api/cliente/equipe/resumo').then(r=>r.status)`)) === 404 && (await ev(`fetch('/api/cliente/sessao').then(r=>r.status)`)) === 200);
  await ev(`fetch('/api/cliente/sair',{method:'POST'}).then(()=>1)`);
  await entrarPainel('chefe@example.com', 'errada12345');
  check('Senha errada → mensagem', await waitFor(`(document.querySelector('[data-msg-entrar]')||{}).textContent?.includes('incorretos')`));
  await entrarPainel('chefe@example.com', 'Painel2026Seguro');
  check('Equipe entra: visão geral com os números', await waitFor(`${vis('[data-numeros]')} && document.querySelector('[data-numeros]').innerText.includes('Documentos em análise')`));
  check('Números: 2 clientes, 1 agendamento, 2 documentos, 1 passaporte a conferir; contadores nas abas', await waitFor(`(()=>{const t=document.querySelector('[data-numeros]').innerText.replace(/\\s+/g,' ');return /2 Clientes/.test(t)&&/1 Agendamentos a confirmar/.test(t)&&/2 Documentos em análise/.test(t)&&/1 Passaportes a conferir/.test(t)&&document.querySelector('[data-cont=documentos_em_analise]').textContent==='2'})()`));
  await shot('p1-visao-geral');

  console.log('--- Clientes');
  await clicar('[data-aba=clientes]');
  check('Lista de clientes com situação e "A conferir"', await waitFor(`document.querySelector('[data-clientes]').innerText.includes('ana@example.com') && document.querySelector('[data-clientes]').innerText.includes('A conferir')`));
  check('Nome com código malicioso aparece como TEXTO (nenhuma imagem/script criado)', await ev(`!window.__xss && !document.querySelector('[data-clientes] img') && document.querySelector('[data-clientes]').innerText.includes('<img src=x')`));
  await ev(`(()=>{const i=document.querySelector('[data-busca]');i.value='bruno';i.dispatchEvent(new Event('input'));return 1})()`);
  check('Busca filtra por nome/e-mail', await waitFor(`(()=>{const t=document.querySelector('[data-clientes]').innerText;return t.includes('bruno@example.com')&&!t.includes('ana@example.com')})()`));
  await ev(`(()=>{const i=document.querySelector('[data-busca]');i.value='';i.dispatchEvent(new Event('input'));return 1})()`);
  await waitFor(`document.querySelector('[data-clientes]').innerText.includes('ana@example.com')`);
  await ev(`(()=>{const f=document.querySelector('[data-form-convite]');f.nome.value='Carla Nova';f.email.value='carla@example.com';f.idioma.value='en';f.requestSubmit();return 1})()`);
  check('Convidar: mensagem de sucesso, Carla na lista como "Convite enviado", e-mail em inglês', await waitFor(`${msg}.includes('Convite enviado para carla@example.com') && document.querySelector('[data-clientes]').innerText.includes('Convite enviado')`) && emails.some((m) => m.to.includes('carla@example.com') && /Client Area/.test(m.subject)));
  await shot('p2-clientes');
  await ev(`(()=>{const l=[...document.querySelectorAll('[data-clientes] .linha-t')].find(x=>x.innerText.includes('ana@example.com'));l.querySelector('button').click();return 1})()`);
  check('Ficha da Ana: passaporte COMPLETO (FX1234567), validade, documentos e agendamento', await waitFor(`document.querySelector('[data-ficha]').open && (()=>{const t=document.querySelector('[data-ficha]').innerText;return t.includes('FX1234567')&&t.includes('20/05/2031')&&t.includes('passaporte-ana.pdf')&&t.includes('Abertura de conta')})()`));
  await shot('p3-ficha');
  await clicarTexto('Marcar como conferido', "document.querySelector('[data-ficha]')");
  check('Conferir passaporte → "Conferido em … por chefe@example.com" e botão de destravar', await waitFor(`document.querySelector('[data-ficha]').innerText.includes('por chefe@example.com') && [...document.querySelectorAll('[data-ficha] button')].some(b=>b.textContent.startsWith('Destravar'))`));
  const travou = await fetch(`${BASE}/api/cliente/perfil`, { method: 'PUT', headers: { Cookie: cAna, Origin: BASE, 'Content-Type': 'application/json' }, body: JSON.stringify({ passportnumber: 'ZZ9999999' }) });
  check('Cliente não consegue mais alterar o passaporte (409)', travou.status === 409);
  await clicarTexto('Bloquear acesso', "document.querySelector('[data-ficha]')");
  check('Bloquear: ficha mostra "Bloqueado" e a sessão da Ana cai', await waitFor(`document.querySelector('[data-ficha]').innerText.includes('Desbloquear acesso')`) && (await fetch(`${BASE}/api/cliente/perfil`, { headers: { Cookie: cAna } })).status === 401);
  await clicarTexto('Desbloquear acesso', "document.querySelector('[data-ficha]')");
  check('Desbloquear', await waitFor(`document.querySelector('[data-ficha]').innerText.includes('Bloquear acesso')`));
  await ev(`document.querySelector('[data-ficha]').close(),1`);
  await ev(`(()=>{const l=[...document.querySelectorAll('[data-clientes] .linha-t')].find(x=>x.innerText.includes('chefe@example.com'));l.querySelector('button').click();return 1})()`);
  check('Na ficha da própria conta da equipe não existe "Bloquear acesso"', await waitFor(`document.querySelector('[data-ficha]').open && document.querySelector('[data-ficha-titulo]').textContent==='chefe@example.com'`) && await ev(`![...document.querySelectorAll('[data-ficha] button')].some(b=>b.textContent==='Bloquear acesso')`));
  await ev(`document.querySelector('[data-ficha]').close(),1`);

  console.log('--- Agendamentos');
  await clicar('[data-aba=agendamentos]');
  check('Pedido da Ana: assunto, data pedida, Vídeo · Manhã, observação, campos já preenchidos (dia pedido, 10:00)', await waitFor(`(()=>{const t=document.querySelector('[data-agendamentos]').innerText;const i=document.querySelector('[data-agendamentos] input[type=date]');return t.includes('Abertura de conta')&&t.includes('Vídeo · Manhã (9h–12h)')&&t.includes('Aguardo contato')&&i&&i.value==='${dias(4)}'&&document.querySelector('[data-agendamentos] input[type=time]').value==='10:00'})()`));
  await shot('p4-agendamentos');
  const nE = emails.length;
  await ev(`(()=>{document.querySelector('[data-agendamentos] input[type=time]').value='11:30';return 1})()`);
  await clicarTexto('Confirmar');
  check('Confirmar → "O cliente recebeu o e-mail", lista de pendentes vazia', await waitFor(`${msg}.includes('O cliente recebeu o e-mail') && document.querySelector('[data-agendamentos]').innerText.includes('Nenhum agendamento esperando')`));
  let eAg; for (let i = 0; i < 50 && !eAg; i++) { eAg = emails.slice(nE).find((m) => m.to.includes('ana@example.com') && /confirmado/i.test(m.subject)); if (!eAg) await sleep(100); }
  check('E-mail "Agendamento confirmado" com 11:30 chegou para a Ana', !!eAg && /11:30/.test(eAg.html));
  if (!eAg || !/11:30/.test(eAg.html)) console.log('   e-mails:', JSON.stringify(emails.slice(nE).map((m) => [m.to, m.subject, (m.html.match(/<strong>[^<]*<\/strong>/) || [])[0]])));
  const agAna = await (await fetch(`${BASE}/api/cliente/agendamentos`, { headers: { Cookie: await sessaoDe('ana@example.com', 'Cliente2026Xyz') } })).json();
  check('Horário salvo em Dubai mesmo com o navegador no fuso de São Paulo (11:30 Dubai = 07:30 UTC)', agAna.agendamentos[0].horarioConfirmado === new Date(`${dias(4)}T07:30:00Z`).toISOString());

  console.log('--- Documentos');
  await clicar('[data-aba=documentos]');
  check('Em análise: 2 documentos com Baixar / Aprovar / Rejeitar', await waitFor(`document.querySelectorAll('[data-documentos] .item').length===2 && document.querySelector('[data-documentos]').innerText.includes('Rejeitar')`));
  await ev(`window.__dl=0; const o=URL.createObjectURL; URL.createObjectURL=(b)=>{window.__dl=b.size; return o(b)}; [...document.querySelectorAll('[data-documentos] .item')].find(x=>x.innerText.includes('passaporte-ana.pdf')).querySelector('.link').click(); 1`);
  check('Baixar: arquivo vem do servidor', await waitFor(`window.__dl > 0`));
  await ev(`[...document.querySelectorAll('[data-documentos] .item')].find(x=>x.innerText.includes('passaporte-ana.pdf')).querySelector('.botao:not(.perigo)').click(),1`);
  check('Aprovar → some da lista de "Em análise"', await waitFor(`${msg}.includes('aprovado') && (()=>{const n=[...document.querySelectorAll('[data-documentos] .item strong')].map(x=>x.textContent);return n.length===1 && n[0]==='comprovante.pdf'})()`));
  await ev(`[...document.querySelectorAll('[data-documentos] .item')][0].querySelector('.perigo').click(),1`);
  check('Rejeitar abre a janela de orientação para o documento certo', await waitFor(`document.querySelector('[data-rejeitar]').open && document.querySelector('[data-rejeitar-qual]').textContent.startsWith('comprovante.pdf')`));
  await shot('p5-rejeitar');
  await ev(`(()=>{const f=document.querySelector('[data-form-rejeitar]');f.pt.value='TEXTO PARA OUTRO CLIENTE';document.querySelector('[data-rejeitar] .link[data-fechar]').click();return 1})()`);
  await ev(`[...document.querySelectorAll('[data-documentos] .item')][0].querySelector('.perigo').click(),1`);
  check('Cancelar e reabrir "Rejeitar": a orientação digitada antes NÃO sobra', await waitFor(`document.querySelector('[data-rejeitar]').open`) && await ev(`document.querySelector('[data-form-rejeitar]').pt.value===''`));
  await ev(`(()=>{const f=document.querySelector('[data-form-rejeitar]');f.requestSubmit();return 1})()`);
  check('Sem orientação → o navegador pede o preenchimento, a janela continua aberta e nada é rejeitado', await ev(`(()=>{const t=document.querySelector('[data-form-rejeitar] textarea[name=pt]');return !t.checkValidity() && document.querySelector('[data-rejeitar]').open})()`) && (await db.q(`select count(*)::int n from documentos where status='rejeitado'`)).rows[0].n === 0);
  await ev(`(()=>{const f=document.querySelector('[data-form-rejeitar]');f.pt.value='Comprovante desatualizado: envie um dos últimos 3 meses.';f.requestSubmit();return 1})()`);
  check('Rejeitar com orientação → lista vazia; a Ana vê a orientação', await waitFor(`document.querySelector('[data-documentos]').innerText.includes('Nenhum documento esperando')`) && (await (await fetch(`${BASE}/api/cliente/documentos`, { headers: { Cookie: await sessaoDe('ana@example.com', 'Cliente2026Xyz') } })).json()).documentos.some((d) => d.orientacao?.pt?.includes('últimos 3 meses')));

  console.log('--- Registro, celular e saída');
  await clicar('[data-aba=registro]');
  check('Registro mostra as ações com quem fez', await waitFor(`(()=>{const t=document.querySelector('[data-registro]').innerText;return ['Convidou','Conferiu passaporte','Bloqueou','Desbloqueou','Confirmou agendamento','Aprovou documento','Rejeitou documento','Abriu a ficha','Baixou documento'].every(x=>t.includes(x)) && t.includes('chefe@example.com')})()`));
  await shot('p6-registro');
  await clicar('[data-aba=clientes]');
  await waitFor(`document.querySelector('[data-clientes]').innerText.includes('ana@example.com')`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(500);
  check('Celular: sem rolagem lateral', (await ev('document.documentElement.scrollWidth')) <= 390);
  await shot('p7-celular', 390, 844);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await clicar('[data-sair]');
  check('Sair → volta à tela de entrar e a sessão acaba', await waitFor(vis('[data-vista="entrar"]')) && (await ev(`fetch('/api/cliente/sessao').then(r=>r.status)`)) === 401);
  check('Sem erros de JavaScript', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
} finally {
  console.log(`\nRESULTADO NAVEGADOR (painel): ${ok} corretos, ${fail} com problema`);
  ws.close(); ch.kill(); srv.kill(); mock.close(); await db.fechar(); await epg.stop();
  if (!process.env.TELAS_DIR) fs.rmSync(TMP, { recursive: true, force: true });
  if (fail) console.log(logSrv.slice(-2000));
}
process.exit(fail ? 1 : 0);
