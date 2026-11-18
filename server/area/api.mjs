/**
 * API da Área do Cliente — rotas /api/cliente/* servidas pelo próprio servidor do site (Railway).
 *
 * Segurança:
 *  - sessão em cookie HttpOnly + SameSite=Strict; no banco fica só o hash; conferida a CADA requisição
 *    (expiração, ociosidade, bloqueio do usuário) — encerrar ou revogar vale na hora;
 *  - toda requisição que altera dados exige Origin do próprio site (proteção contra CSRF);
 *  - cada cliente só enxerga o que é dele (consultas sempre filtradas pelo usuário da sessão);
 *  - equipe: cadastro equipe.ativo lido a cada requisição (revogação imediata);
 *  - documentos: arquivo imutável no volume, fora da pasta pública; download só por aqui, sem link;
 *  - respostas com Cache-Control: no-store.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  conferirSenha, gerarHashSenha, politicaSenha, novoToken, hashToken, cookieSessao, cookieApagar, lerCookie,
  SESSAO_OCIOSA_MS, SESSAO_MAX_MS, FORMATOS, conteudoConfere, ORIENTACOES, ipDoVisitante, chaveDeIp,
} from './nucleo.mjs';

export const CAMPOS_PERFIL = { display_name: 120, phone_number: 40, nationality: 80, dateofbirth: 40, address: 200, residencenumber: 40, city: 80, country: 80, zipcode: 20 };
export const CAMPOS_EMPRESA = { CompanyName: 160, Companyregistrationnumber: 60, companysadress: 200, companyaddressnumber: 40, companycity: 80, companycountry: 80, companyzipcode: 20 };
const EDITAVEIS = { ...CAMPOS_PERFIL, ...CAMPOS_EMPRESA };
// passaporte: editável pelo cliente SÓ enquanto a equipe não conferiu (validação de formato no servidor)
const CAMPOS_PASSAPORTE = ['passportnumber', 'passportexpirationdate'];
const dataCivilValida = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); if (!m) return false;
  const [a, me, d] = m.slice(1).map(Number); const x = new Date(Date.UTC(a, me - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() === me - 1 && x.getUTCDate() === d;
};
function validarPassaporte(k, v) {
  if (k === 'passportnumber') { const n = v.replace(/[\s-]/g, '').toUpperCase(); return n === '' || /^[A-Z0-9]{5,20}$/.test(n) ? n : null; }
  return v === '' || (dataCivilValida(v) && v >= '2000-01-01' && v <= '2100-12-31') ? v : null;
}
// agendamentos pedidos pelo cliente
export const ASSUNTOS_AGENDAMENTO = ['abertura_conta', 'investimentos', 'documentos', 'outro'];
export const FORMATOS_AGENDAMENTO = ['video', 'presencial'];
export const PERIODOS_AGENDAMENTO = ['manha', 'tarde', 'qualquer'];
const AGENDA_PENDENTES_MAX = 3;      // pedidos em aberto (sem horário confirmado) por cliente
const AGENDA_DIA_MAX = 5;            // pedidos por cliente em 24 h
const AGENDA_DIAS_MAX = 180;         // até quantos dias à frente
const hojeDubai = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
const somarDias = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MAX_ARQUIVO = 10 * 1024 * 1024;
// cota de envios por cliente (24 h): evita lotar o volume
const COTA_ARQUIVOS_DIA = 30;
const COTA_BYTES_DIA = 200 * 1024 * 1024;
const EQUIPE_OCIOSA_MS = 30 * 60 * 1000;   // sessão de conta da equipe: 30 min parada encerra
const RECUSAS_DIA = 50;               // arquivos recusados (não ocupam disco) têm limite próprio
const ENVIOS_SIMULTANEOS = 3;         // envios em andamento por cliente (limita o disco temporário)
// cabeçalhos de segurança de toda resposta da API
const SEG = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Strict-Transport-Security': 'max-age=31536000', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' };

/** Limpeza periódica: tentativas (>1 dia), sessões encerradas/vencidas (>7 dias), links de senha usados/vencidos (>30 dias). */
export async function limparRegistrosAntigos(db) {
  await db.q(`delete from tentativas_login where em < now() - interval '1 day'`);
  await db.q(`delete from sessoes where (revogada_em is not null or expira_em < now()) and criada_em < now() - interval '7 days'`);
  await db.q(`delete from tokens_senha where (usado_em is not null or expira_em < now()) and criado_em < now() - interval '30 days'`);
  await db.q(`delete from ips_confiaveis where ultimo_login_em < now() - interval '90 days'`);
}
const LIBERADOS = ['disponivel_analise', 'aprovado'];
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

export function criarApi({ db, arquivos, origens, enviarEmail, avisarEquipe = null, siteUrl = process.env.AREA_SITE_URL || 'https://ctbfinances.ae', log = console }) {
  const json = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...SEG, ...extra });
    res.end(JSON.stringify(body));
  };
  // recusa um corpo que não será usado: responde, descarta o restante só até um TETO (para o cliente conseguir ler a
  // resposta) e então fecha a conexão. Envio sem fim (sem Content-Length) não é mais lido além do teto nem de 10 s.
  // tetoDescarte = 0: o corpo já foi lido além do limite → responde e FECHA a conexão assim que a resposta sai
  // (se a conexão continuasse aberta, o Node seguiria descartando o restante do envio sem limite).
  const recusar = (req, res, status, body, tetoDescarte = 1024 * 1024) => {
    if (tetoDescarte === 0) {
      res.on('finish', () => req.socket?.destroy());
      return json(res, status, body, { Connection: 'close' });
    }
    // sem "Connection: close": o Node fecharia a conexão logo após a resposta e o cliente, ainda enviando, veria
    // falha de rede em vez do status. O descarte abaixo é que limita (teto de bytes e de tempo).
    json(res, status, body);
    if (req.complete) return;
    let n = 0;
    const cortar = () => { clearTimeout(relogio); req.socket?.destroy(); req.destroy(); };
    const relogio = setTimeout(cortar, 10_000); relogio.unref();
    req.on('data', (c) => { n += c.length; if (n > tetoDescarte) cortar(); });
    req.on('end', () => clearTimeout(relogio));
    req.on('error', () => clearTimeout(relogio));
    req.resume();
  };
  // IP usado nos limites e na lista de IPs conhecidos: IPv6 agrupado pelo bloco /64
  const ip = (req) => chaveDeIp(ipDoVisitante(req));
  const origemValida = (req) => origens.has(req.headers.origin || '');
  const lerJson = (req, max = 20000) => new Promise((ok, erro) => {
    let t = '', n = 0, grande = false;
    // acima do limite: para de acumular e devolve 413 (a conexão é fechada DEPOIS que a resposta sai)
    req.on('data', (c) => { if (grande) return; n += c.length; if (n > max) { grande = true; req.pause(); erro(Object.assign(new Error('grande'), { status: 413, fechar: true })); } else t += c; });
    req.on('end', () => { try { ok(t ? JSON.parse(t) : {}); } catch { erro(Object.assign(new Error('json'), { status: 400 })); } });
    req.on('error', erro);
  });

  // ---- limite de tentativas (persistente no banco, ATÔMICO sob concorrência)
  // Cada chave (ex.: email:x, ip:y) é travada com pg_advisory_xact_lock; contagem e reserva acontecem na mesma
  // transação. Uma reserva conta como verificação; se o login der certo, as reservas dele são removidas.
  async function reservarTentativa(chaves) {
    return db.transacao(async (q) => {
      for (const [chave] of [...chaves].sort((a, b) => a[0].localeCompare(b[0]))) await q('select pg_advisory_xact_lock(hashtextextended($1, 0))', [chave]);
      for (const [chave, max, janelaMin] of chaves) {
        const r = await q(`select count(*)::int n from tentativas_login where chave=$1 and em > now() - ($2 || ' minutes')::interval`, [chave, String(janelaMin)]);
        if (r.rows[0].n >= max) return null;
      }
      const ids = [];
      for (const [chave] of chaves) ids.push((await q('insert into tentativas_login(chave) values ($1) returning id', [chave])).rows[0].id);
      return ids;
    });
  }
  const liberarReservas = (ids) => db.q('delete from tentativas_login where id = any($1::bigint[])', [ids]);

  // ---- sessão: conferida a cada requisição
  async function autenticar(req) {
    const token = lerCookie(req);
    if (!token || token.length > 100) return null;
    const r = await db.q(
      `select s.id_hash, s.criada_em, s.ultimo_uso_em, (extract(epoch from now() - s.ultimo_uso_em) * 1000)::bigint as ocioso_ms, u.id, u.email, u.email_verificado_em, u.bloqueado,
              coalesce(e.ativo, false) as equipe
         from sessoes s join usuarios u on u.id = s.usuario_id left join equipe e on e.usuario_id = u.id
        where s.id_hash = $1 and s.revogada_em is null and s.expira_em > now()
          and s.ultimo_uso_em > now() - ($2 || ' milliseconds')::interval`, [hashToken(token), String(SESSAO_OCIOSA_MS)]);
    const s = r.rows[0];
    if (!s || s.bloqueado) return null;
    // contas da equipe (acesso a dados de todos os clientes): sessão encerra após 30 min parada
    if (s.equipe === true && Number(s.ocioso_ms) > EQUIPE_OCIOSA_MS) {   // calculado no banco (sem diferença de relógio)
      await db.q('update sessoes set revogada_em=now() where id_hash=$1 and revogada_em is null', [s.id_hash]);
      return null;
    }
    if (Number(s.ocioso_ms) > 60_000) await db.q('update sessoes set ultimo_uso_em=now() where id_hash=$1', [s.id_hash]);
    return { id: s.id, email: s.email, verificado: Boolean(s.email_verificado_em), equipe: s.equipe === true, sessao: s.id_hash };
  }
  async function criarSessao(res, req, usuarioId) {
    const token = novoToken();
    await db.q('insert into sessoes(id_hash, usuario_id, expira_em, ip, agente) values ($1,$2, now() + ($3 || \' milliseconds\')::interval, $4, $5)',
      [hashToken(token), usuarioId, String(SESSAO_MAX_MS), ip(req), String(req.headers['user-agent'] || '').slice(0, 200)]);
    res.setHeader('Set-Cookie', cookieSessao(token));
  }

  // ---- e-mails de acesso (convite / redefinição)
  async function enviarLinkSenha(usuario, finalidade, lang = 'pt') {
    const token = novoToken();
    const horas = finalidade === 'convite' ? 72 : 1;
    // reenvio: o link novo SUBSTITUI os anteriores ainda pendentes (só o mais recente vale)
    await db.transacao(async (q) => {
      await q('select id from usuarios where id=$1 for update', [usuario.id]);
      await q('update tokens_senha set usado_em=now() where usuario_id=$1 and usado_em is null', [usuario.id]);
      await q('insert into tokens_senha(hash, usuario_id, finalidade, expira_em) values ($1,$2,$3, now() + ($4 || \' hours\')::interval)', [hashToken(token), usuario.id, finalidade, String(horas)]);
    });
    const pagina = lang === 'en' ? '/en/client-area/' : '/area-do-cliente/';
    const link = `${siteUrl}${pagina}?${finalidade === 'convite' ? 'convite' : 'redefinir'}=${token}`;
    await enviarEmail({ to: usuario.email, finalidade, lang, link, horas });
    return token;
  }

  // ---- rotas
  async function entrar(req, res) {
    const b = await lerJson(req);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 160), senha = String(b.senha || '');
    // limites (15 min, reserva atômica ANTES de verificar a senha):
    //  - 5 por conta a partir do MESMO IP  → força bruta de um lugar só
    //  - 30 por IP                           → um IP testando muitas contas
    //  - 30 por conta somando todos os IPs   → ataque distribuído; terceiros só bloqueiam o cliente gastando 30 tentativas
    //    de vários IPs (e o cliente continua entrando do próprio IP até lá)
    const conhecido = (await db.q(`select 1 from ips_confiaveis c join usuarios u on u.id=c.usuario_id where u.email=$1 and c.ip=$2 and c.ultimo_login_em > now() - interval '90 days'`, [email, ip(req)])).rowCount > 0;
    const limites = [[`email-ip:${email}|${ip(req)}`, 5, 15], [`ip:${ip(req)}`, 30, 15]];
    if (!conhecido) limites.push([`email:${email}`, 30, 15]);   // IP onde o cliente já entrou: sem o teto geral da conta
    const reservas = await reservarTentativa(limites);
    if (!reservas) return json(res, 429, { erro: 'muitas_tentativas' });
    const r = await db.q('select id, senha_hash, bloqueado from usuarios where email=$1', [email]);
    const u = r.rows[0];
    const ok = await conferirSenha(senha, u && u.senha_hash);
    if (!u || !ok || u.bloqueado) return json(res, 401, { erro: 'credenciais' }); // a reserva fica como falha registrada
    await liberarReservas(reservas);                                                 // login legítimo não consome o limite
    await db.q(`insert into ips_confiaveis(usuario_id, ip) values ($1,$2) on conflict (usuario_id, ip) do update set ultimo_login_em=now()`, [u.id, ip(req)]);
    await criarSessao(res, req, u.id);
    return json(res, 200, { ok: true });
  }
  async function sair(req, res) {
    const token = lerCookie(req);
    if (token) await db.q('update sessoes set revogada_em=now() where id_hash=$1 and revogada_em is null', [hashToken(token)]);
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookieApagar() });
  }
  async function esqueci(req, res) {
    const b = await lerJson(req);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
    const lang = b.lang === 'en' ? 'en' : 'pt';
    // mesma resposta exista ou não a conta
    if (EMAIL_RE.test(email) && (await reservarTentativa([[`esqueci:${email}`, 3, 60], [`esqueci-ip:${ip(req)}`, 10, 60]]))) {
      // em segundo plano: a resposta não espera banco nem e-mail (não revela pela demora se a conta existe)
      setImmediate(async () => {
        try {
          const u = (await db.q('select id, email, bloqueado, senha_hash from usuarios where email=$1', [email])).rows[0];
          if (u && !u.bloqueado) await enviarLinkSenha(u, u.senha_hash ? 'redefinir' : 'convite', lang);
        } catch (e) { log.error('[area-cliente] e-mail de senha', e.message); }
      });
    }
    return json(res, 200, { ok: true });
  }
  async function redefinir(req, res) {
    const b = await lerJson(req);
    const token = String(b.token || ''), senha = String(b.senha || '');
    const t = (await db.q(`select t.usuario_id, u.email from tokens_senha t join usuarios u on u.id=t.usuario_id
                            where t.hash=$1 and t.usado_em is null and t.expira_em > now() and not u.bloqueado`, [hashToken(token)])).rows[0];
    if (!t) return json(res, 400, { erro: 'link_invalido' });
    const pol = politicaSenha(senha, t.email);
    if (pol) return json(res, 400, { erro: 'senha_' + pol });
    const hash = await gerarHashSenha(senha);
    // trava a conta: links do mesmo usuário usados ao mesmo tempo são processados um de cada vez
    const ok = await db.transacao(async (q) => {
      await q('select id from usuarios where id=$1 for update', [t.usuario_id]);
      const valido = await q(`update tokens_senha set usado_em=now() where hash=$1 and usuario_id=$2 and usado_em is null and expira_em > now() returning 1`, [hashToken(token), t.usuario_id]);
      if (!valido.rowCount) return false;
      await q('update tokens_senha set usado_em=now() where usuario_id=$1 and usado_em is null', [t.usuario_id]); // invalida TODOS os outros links pendentes
      await q('update usuarios set senha_hash=$1, email_verificado_em=coalesce(email_verificado_em, now()) where id=$2', [hash, t.usuario_id]);
      await q('update sessoes set revogada_em=now() where usuario_id=$1 and revogada_em is null', [t.usuario_id]); // encerra sessões abertas
      return true;
    });
    if (!ok) return json(res, 400, { erro: 'link_invalido' });
    await criarSessao(res, req, t.usuario_id);
    return json(res, 200, { ok: true });
  }

  function perfilPublico(dados, conferidoEm = null) {
    const d = dados || {}, out = {};
    for (const k of Object.keys(EDITAVEIS)) out[k] = typeof d[k] === 'string' ? d[k] : '';
    const pn = typeof d.passportnumber === 'string' ? d.passportnumber : '';
    out.passaporte = pn ? '•••• ' + pn.slice(-3) : '';   // o número completo nunca volta pela web
    out.passaporteValidade = typeof d.passportexpirationdate === 'string' ? d.passportexpirationdate : '';
    out.passaporteConferidoEm = conferidoEm || null;
    return out;
  }
  async function perfil(req, res, u) {
    if (req.method === 'GET') {
      const r = await db.q('select dados, passaporte_conferido_em from perfis where usuario_id=$1', [u.id]);
      return json(res, 200, { email: u.email, verificado: u.verificado, perfil: perfilPublico(r.rows[0] && r.rows[0].dados, r.rows[0] && r.rows[0].passaporte_conferido_em) });
    }
    const b = await lerJson(req);
    const alteracoes = {};
    for (const [k, v] of Object.entries(b && typeof b === 'object' ? b : {})) {
      if (CAMPOS_PASSAPORTE.includes(k)) {
        const val = typeof v === 'string' && v.length <= 40 ? validarPassaporte(k, v.trim()) : null;
        if (val === null) return json(res, 400, { erro: 'valor_invalido', campo: k });
        alteracoes[k] = val; continue;
      }
      if (!Object.hasOwn(EDITAVEIS, k)) return json(res, 400, { erro: 'campo_nao_permitido', campo: String(k).slice(0, 40) });
      if (typeof v !== 'string' || v.length > EDITAVEIS[k]) return json(res, 400, { erro: 'valor_invalido', campo: k });
      alteracoes[k] = v.trim();
    }
    // passaporte já conferido pela equipe: a gravação inteira é recusada (condição no próprio UPDATE, sem corrida)
    const mexePassaporte = CAMPOS_PASSAPORTE.some((k) => Object.hasOwn(alteracoes, k));
    const r = await db.q(`insert into perfis(usuario_id, dados) values ($1, $2::jsonb)
                          on conflict (usuario_id) do update set dados = perfis.dados || excluded.dados, atualizado_em = now()
                          ${mexePassaporte ? 'where perfis.passaporte_conferido_em is null' : ''}
                          returning dados, passaporte_conferido_em`, [u.id, JSON.stringify(alteracoes)]);
    if (!r.rowCount) return json(res, 409, { erro: 'passaporte_conferido' });
    return json(res, 200, { perfil: perfilPublico(r.rows[0].dados, r.rows[0].passaporte_conferido_em) });
  }

  const docPublico = (d) => ({ id: d.id, nome: d.nome, tipo: d.tipo, tamanho: d.tamanho, status: d.status, motivo: d.motivo, orientacao: d.orientacao, recebidoEm: d.recebido_em, baixavel: LIBERADOS.includes(d.status) || (d.status === 'rejeitado' && d.motivo === 'analise_equipe') });
  async function listarDocumentos(res, u) {
    const r = await db.q('select * from documentos where usuario_id=$1 order by recebido_em desc', [u.id]);
    return json(res, 200, { documentos: r.rows.map(docPublico) });
  }
  const emAndamento = new Map();
  async function enviarDocumento(req, res, u) {
    const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!FORMATOS[tipo]) return recusar(req, res, 415, { erro: 'tipo_nao_aceito' }, 2 * MAX_ARQUIVO);
    const declarado = Number(req.headers['content-length'] || 0);
    if (declarado > MAX_ARQUIVO) return recusar(req, res, 413, { erro: 'muito_grande' }, 2 * MAX_ARQUIVO);
    // cota (24 h): conta só arquivos GUARDADOS (os recusados não ocupam disco e têm limite próprio)
    const cota = async (q) => (await q(`select count(*) filter (where chave_arquivo is not null)::int n,
                                              coalesce(sum(tamanho) filter (where chave_arquivo is not null),0)::bigint b,
                                              count(*) filter (where chave_arquivo is null)::int recusados
                                         from documentos where usuario_id=$1 and recebido_em > now() - interval '1 day'`, [u.id])).rows[0];
    const c0 = await cota(db.q);
    if (c0.n >= COTA_ARQUIVOS_DIA || c0.recusados >= RECUSAS_DIA || Number(c0.b) + Math.max(declarado, 0) > COTA_BYTES_DIA) return recusar(req, res, 429, { erro: 'cota' }, 2 * MAX_ARQUIVO);
    // no máximo 3 envios em andamento por cliente (limita o espaço temporário em disco)
    if ((emAndamento.get(u.id) || 0) >= ENVIOS_SIMULTANEOS) return recusar(req, res, 429, { erro: 'envios_simultaneos' }, 2 * MAX_ARQUIVO);
    emAndamento.set(u.id, (emAndamento.get(u.id) || 0) + 1);
    try { return await receberDocumento(req, res, u, tipo, cota); }
    finally { const n = (emAndamento.get(u.id) || 1) - 1; if (n > 0) emAndamento.set(u.id, n); else emAndamento.delete(u.id); }
  }
  async function receberDocumento(req, res, u, tipo, cota) {
    let nome = 'documento';
    try { nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] || 'documento')); } catch { /* mantém padrão */ }
    nome = nome.normalize('NFC').replace(/[\\/\u0000-\u001f]/g, '_').slice(-120) || 'documento';
    const tmp = arquivos.temporario();
    const hash = crypto.createHash('sha256');
    let tamanho = 0, inicio = Buffer.alloc(0), fim = Buffer.alloc(0), excedeu = false;
    const saida = fs.createWriteStream(tmp, { mode: 0o600 });
    try {
      await new Promise((ok, erro) => {
        req.on('data', (c) => {
          tamanho += c.length;
          if (tamanho > MAX_ARQUIVO) { excedeu = true; req.unpipe(saida); saida.destroy(); req.pause(); return ok(); }
          hash.update(c);
          if (inicio.length < 16) inicio = Buffer.concat([inicio, c]).subarray(0, 16);
          fim = Buffer.concat([fim, c]); if (fim.length > 1024) fim = fim.subarray(fim.length - 1024);
        });
        req.pipe(saida);
        saida.on('finish', ok); saida.on('error', erro); req.on('error', erro);
      });
    } catch (e) { await arquivos.apagar(tmp); throw e; }
    if (excedeu) { await arquivos.apagar(tmp); return recusar(req, res, 413, { erro: 'muito_grande' }, 0); }
    if (tamanho === 0) { await arquivos.apagar(tmp); return json(res, 400, { erro: 'vazio' }); }
    const sha = hash.digest('hex');
    if (!conteudoConfere(tipo, inicio, fim)) {
      await arquivos.apagar(tmp);
      const r = await db.q(`insert into documentos(usuario_id, nome, tipo, tamanho, sha256, status, motivo, orientacao, validado_em)
                            values ($1,$2,$3,$4,$5,'rejeitado','conteudo_nao_confere',$6, now()) returning *`, [u.id, nome, tipo, tamanho, sha, JSON.stringify(ORIENTACOES.conteudo_nao_confere)]);
      return json(res, 422, { documento: docPublico(r.rows[0]) });
    }
    const chave = await arquivos.efetivar(tmp);
    try {
      const r = await db.transacao(async (q) => {
        await q('select pg_advisory_xact_lock(hashtextextended($1, 0))', ['cota:' + u.id]);
        const c = await cota(q);
        if (c.n >= COTA_ARQUIVOS_DIA || Number(c.b) + tamanho > COTA_BYTES_DIA) return null;
        return q(`insert into documentos(usuario_id, nome, tipo, tamanho, sha256, chave_arquivo, status, validado_em)
                  values ($1,$2,$3,$4,$5,$6,'disponivel_analise', now()) returning *`, [u.id, nome, tipo, tamanho, sha, chave]);
      });
      if (!r) { await arquivos.apagar(arquivos.caminho(chave)); return json(res, 429, { erro: 'cota' }); }
      return json(res, 201, { documento: docPublico(r.rows[0]) });
    } catch (e) { await arquivos.apagar(arquivos.caminho(chave)); throw e; }
  }
  async function baixarDocumento(res, u, id) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return json(res, 404, { erro: 'nao_encontrado' });
    const d = (await db.q('select * from documentos where id=$1', [id])).rows[0];
    // outro cliente recebe o mesmo 404 de "não existe" (não revela a existência)
    if (!d || (d.usuario_id !== u.id && !u.equipe)) return json(res, 404, { erro: 'nao_encontrado' });
    if (!docPublico(d).baixavel || !d.chave_arquivo) return json(res, 409, { erro: 'nao_liberado', status: d.status });
    // abre ANTES de enviar qualquer cabeçalho: ausência ou falha de abertura vira resposta controlada
    let fh;
    try { fh = await arquivos.abrir(d.chave_arquivo); }
    catch (e) {
      log.error('[area-cliente] arquivo indisponível', d.id, e.code || e.message);
      return json(res, e.code === 'ENOENT' ? 409 : 500, { erro: e.code === 'ENOENT' ? 'arquivo_ausente' : 'arquivo_indisponivel' });
    }
    try {
      const { size } = await fh.stat();
      await db.q('insert into acessos_documentos(documento_id, usuario_id, papel) values ($1,$2,$3)', [d.id, u.id, d.usuario_id === u.id ? 'dono' : 'equipe']);
      if (d.usuario_id !== u.id) await db.q('insert into acoes_equipe(por_usuario, por_email, acao, alvo) values ($1,$2,$3,$4)', [u.id, u.email, 'baixar_documento', d.id]);
      res.writeHead(200, {
        ...SEG, 'Content-Type': d.tipo, 'Content-Length': size, 'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${d.nome.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(d.nome)}`,
      });
      // aguarda a transferência; erro de leitura ou aborto do cliente encerra só esta resposta
      await pipeline(fh.createReadStream(), res);
    } catch (e) {
      if (e.code !== 'ERR_STREAM_PREMATURE_CLOSE') log.error('[area-cliente] transferência interrompida', d.id, e.code || e.message);
      if (!res.headersSent) return json(res, 500, { erro: 'arquivo_indisponivel' });
      res.destroy();
    } finally {
      await fh.close().catch(() => {});
    }
  }
  async function agendamentos(res, u) {
    const r = await db.q(`select id, tipo, descricao, formato, periodo, to_char(data_solicitada, 'YYYY-MM-DD') as data_solicitada, horario_confirmado
                            from agendamentos where usuario_id=$1 order by coalesce(horario_confirmado, data_solicitada::timestamptz) desc nulls last`, [u.id]);
    return json(res, 200, { agendamentos: r.rows.map((a) => ({ id: a.id, tipo: a.tipo, descricao: a.descricao, formato: a.formato, periodo: a.periodo, dataSolicitada: a.data_solicitada, horarioConfirmado: a.horario_confirmado })) });
  }
  /** Pedido de agendamento feito pelo cliente: assunto da lista fixa, data civil futura, observação curta. */
  async function solicitarAgendamento(req, res, u) {
    const b = await lerJson(req, 4000);
    const assunto = b && b.assunto, data = b && b.data, formato = b && b.formato, periodo = b && b.periodo;
    const obs = typeof (b && b.observacao) === 'string' ? b.observacao.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '';
    if (!ASSUNTOS_AGENDAMENTO.includes(assunto)) return json(res, 400, { erro: 'assunto_invalido' });
    if (!FORMATOS_AGENDAMENTO.includes(formato)) return json(res, 400, { erro: 'formato_invalido' });
    if (!PERIODOS_AGENDAMENTO.includes(periodo)) return json(res, 400, { erro: 'periodo_invalido' });
    const hoje = hojeDubai();
    if (!dataCivilValida(data) || data <= hoje || data > somarDias(hoje, AGENDA_DIAS_MAX)) return json(res, 400, { erro: 'data_invalida' });
    if (obs.length > 500 || (b.observacao !== undefined && typeof b.observacao !== 'string')) return json(res, 400, { erro: 'observacao_invalida' });
    const r = await db.transacao(async (q) => {
      await q('select pg_advisory_xact_lock(hashtextextended($1, 0))', ['agenda:' + u.id]);
      const c = (await q(`select count(*) filter (where horario_confirmado is null and data_solicitada >= $2::date)::int as abertos,
                                 count(*) filter (where criado_em > now() - interval '24 hours')::int as dia
                            from agendamentos where usuario_id=$1 and solicitado_pelo_cliente`, [u.id, hoje])).rows[0];
      if (c.abertos >= AGENDA_PENDENTES_MAX || c.dia >= AGENDA_DIA_MAX) return null;
      return (await q(`insert into agendamentos(usuario_id, tipo, descricao, data_solicitada, formato, periodo, solicitado_pelo_cliente)
                       values ($1,$2,$3,$4,$5,$6,true) returning id, tipo, descricao, formato, periodo, to_char(data_solicitada,'YYYY-MM-DD') as data_solicitada`, [u.id, assunto, obs || null, data, formato, periodo])).rows[0];
    });
    if (!r) return json(res, 429, { erro: 'limite_agendamentos' });
    if (avisarEquipe) {
      setImmediate(async () => {
        try {
          const n = (await db.q(`select dados->>'display_name' as nome from perfis where usuario_id=$1`, [u.id])).rows[0];
          await avisarEquipe({ email: u.email, nome: (n && n.nome) || '', assunto, data, formato, periodo, observacao: obs });
        } catch (e) { log.error('[area-cliente] aviso de agendamento à equipe:', e.message); }
      });
    }
    return json(res, 201, { agendamento: { id: r.id, tipo: r.tipo, descricao: r.descricao, formato: r.formato, periodo: r.periodo, dataSolicitada: r.data_solicitada, horarioConfirmado: null } });
  }

  async function tratar(req, res, url) {
    const rota = url.pathname.replace(/\/+$/, '');
    const m = req.method;
    try {
      if (m !== 'GET' && m !== 'HEAD' && !origemValida(req)) return json(res, 403, { erro: 'origem' });
      if (rota === '/api/cliente/status' && m === 'GET') {
        // diagnóstico TEMPORÁRIO (só com AREA_DIAGNOSTICO_IP=1): mostra qual IP o servidor enxerga, para conferir o proxy
        if (process.env.AREA_DIAGNOSTICO_IP === '1') return json(res, 200, { ativo: true, ipVisto: ip(req), xRealIp: String(req.headers['x-real-ip'] || ''), cfConnectingIp: String(req.headers['cf-connecting-ip'] || ''), xForwardedFor: String(req.headers['x-forwarded-for'] || ''), socket: String(req.socket.remoteAddress || '') });
        return json(res, 200, { ativo: true });
      }
      if (rota === '/api/cliente/entrar' && m === 'POST') return await entrar(req, res);
      if (rota === '/api/cliente/sair' && m === 'POST') return await sair(req, res);
      if (rota === '/api/cliente/esqueci' && m === 'POST') return await esqueci(req, res);
      if (rota === '/api/cliente/redefinir' && m === 'POST') return await redefinir(req, res);
      const u = await autenticar(req);
      if (!u) return json(res, 401, { erro: 'sessao' }, { 'Set-Cookie': cookieApagar() });
      if (rota === '/api/cliente/sessao' && m === 'GET') return json(res, 200, { email: u.email, verificado: u.verificado, equipe: u.equipe });
      if (rota.startsWith('/api/cliente/equipe/')) return painel ? await painel(req, res, url, u) : json(res, 404, { erro: 'rota' });
      if (rota === '/api/cliente/perfil' && (m === 'GET' || m === 'PUT')) return await perfil(req, res, u);
      if (rota === '/api/cliente/documentos' && m === 'GET') return await listarDocumentos(res, u);
      if (rota === '/api/cliente/documentos' && m === 'POST') return await enviarDocumento(req, res, u);
      const dl = rota.match(/^\/api\/cliente\/documentos\/([^/]+)\/arquivo$/);
      if (dl && m === 'GET') return await baixarDocumento(res, u, dl[1]);
      if (rota === '/api/cliente/agendamentos' && m === 'GET') return await agendamentos(res, u);
      if (rota === '/api/cliente/agendamentos' && m === 'POST') return await solicitarAgendamento(req, res, u);
      return json(res, 404, { erro: 'rota' });
    } catch (e) {
      if (e.status) return e.fechar ? recusar(req, res, e.status, { erro: e.message }, 0) : json(res, e.status, { erro: e.message });
      log.error('[area-cliente]', e);
      if (!res.headersSent) return json(res, 500, { erro: 'interno' });
      res.destroy();
    }
  }
  let painel = null;
  /** Liga o painel da equipe: recebe uma fábrica que ganha as ferramentas internas (json, lerJson). */
  const ligarPainel = (fabrica) => { painel = fabrica({ json, lerJson }); };
  return { tratar, enviarLinkSenha, ligarPainel };
}
