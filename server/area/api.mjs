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
  SESSAO_OCIOSA_MS, SESSAO_MAX_MS, FORMATOS, conteudoConfere, ORIENTACOES,
} from './nucleo.mjs';

export const CAMPOS_PERFIL = { display_name: 120, phone_number: 40, nationality: 80, dateofbirth: 40, address: 200, residencenumber: 40, city: 80, country: 80, zipcode: 20 };
export const CAMPOS_EMPRESA = { CompanyName: 160, Companyregistrationnumber: 60, companysadress: 200, companyaddressnumber: 40, companycity: 80, companycountry: 80, companyzipcode: 20 };
const EDITAVEIS = { ...CAMPOS_PERFIL, ...CAMPOS_EMPRESA };
const MAX_ARQUIVO = 10 * 1024 * 1024;
const LIBERADOS = ['disponivel_analise', 'aprovado'];
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

export function criarApi({ db, arquivos, origens, enviarEmail, siteUrl = process.env.AREA_SITE_URL || 'https://ctbfinances.ae', log = console }) {
  const json = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
    res.end(JSON.stringify(body));
  };
  const ip = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const origemValida = (req) => origens.has(req.headers.origin || '');
  const lerJson = (req, max = 20000) => new Promise((ok, erro) => {
    let t = '', n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { erro(Object.assign(new Error('grande'), { status: 413 })); req.destroy(); } else t += c; });
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
      `select s.id_hash, s.criada_em, s.ultimo_uso_em, u.id, u.email, u.email_verificado_em, u.bloqueado,
              coalesce(e.ativo, false) as equipe
         from sessoes s join usuarios u on u.id = s.usuario_id left join equipe e on e.usuario_id = u.id
        where s.id_hash = $1 and s.revogada_em is null and s.expira_em > now()
          and s.ultimo_uso_em > now() - ($2 || ' milliseconds')::interval`, [hashToken(token), String(SESSAO_OCIOSA_MS)]);
    const s = r.rows[0];
    if (!s || s.bloqueado) return null;
    if (Date.now() - new Date(s.ultimo_uso_em).getTime() > 60_000) await db.q('update sessoes set ultimo_uso_em=now() where id_hash=$1', [s.id_hash]);
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
    // limite: 5 verificações por conta e 30 por IP a cada 15 min (reserva atômica ANTES de verificar a senha)
    const reservas = await reservarTentativa([[`email:${email}`, 5, 15], [`ip:${ip(req)}`, 30, 15]]);
    if (!reservas) return json(res, 429, { erro: 'muitas_tentativas' });
    const r = await db.q('select id, senha_hash, bloqueado from usuarios where email=$1', [email]);
    const u = r.rows[0];
    const ok = await conferirSenha(senha, u && u.senha_hash);
    if (!u || !ok || u.bloqueado) return json(res, 401, { erro: 'credenciais' }); // a reserva fica como falha registrada
    await liberarReservas(reservas);                                                 // login legítimo não consome o limite
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
      const u = (await db.q('select id, email, bloqueado, senha_hash from usuarios where email=$1', [email])).rows[0];
      if (u && !u.bloqueado) await enviarLinkSenha(u, u.senha_hash ? 'redefinir' : 'convite', lang).catch((e) => log.error('e-mail de senha', e.message));
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

  function perfilPublico(dados) {
    const d = dados || {}, out = {};
    for (const k of Object.keys(EDITAVEIS)) out[k] = typeof d[k] === 'string' ? d[k] : '';
    const pn = typeof d.passportnumber === 'string' ? d.passportnumber : '';
    out.passaporte = pn ? '•••• ' + pn.slice(-3) : '';
    return out;
  }
  async function perfil(req, res, u) {
    if (req.method === 'GET') {
      const r = await db.q('select dados from perfis where usuario_id=$1', [u.id]);
      return json(res, 200, { email: u.email, verificado: u.verificado, perfil: perfilPublico(r.rows[0] && r.rows[0].dados) });
    }
    const b = await lerJson(req);
    const alteracoes = {};
    for (const [k, v] of Object.entries(b && typeof b === 'object' ? b : {})) {
      if (!(k in EDITAVEIS)) return json(res, 400, { erro: 'campo_nao_permitido', campo: k });
      if (typeof v !== 'string' || v.length > EDITAVEIS[k]) return json(res, 400, { erro: 'valor_invalido', campo: k });
      alteracoes[k] = v.trim();
    }
    const r = await db.q(`insert into perfis(usuario_id, dados) values ($1, $2::jsonb)
                          on conflict (usuario_id) do update set dados = perfis.dados || excluded.dados, atualizado_em = now()
                          returning dados`, [u.id, JSON.stringify(alteracoes)]);
    return json(res, 200, { perfil: perfilPublico(r.rows[0].dados) });
  }

  const docPublico = (d) => ({ id: d.id, nome: d.nome, tipo: d.tipo, tamanho: d.tamanho, status: d.status, motivo: d.motivo, orientacao: d.orientacao, recebidoEm: d.recebido_em, baixavel: LIBERADOS.includes(d.status) || (d.status === 'rejeitado' && d.motivo === 'analise_equipe') });
  async function listarDocumentos(res, u) {
    const r = await db.q('select * from documentos where usuario_id=$1 order by recebido_em desc', [u.id]);
    return json(res, 200, { documentos: r.rows.map(docPublico) });
  }
  async function enviarDocumento(req, res, u) {
    const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!FORMATOS[tipo]) { req.resume(); return json(res, 415, { erro: 'tipo_nao_aceito' }); }
    const declarado = Number(req.headers['content-length'] || 0);
    if (declarado > MAX_ARQUIVO) { req.resume(); return json(res, 413, { erro: 'muito_grande' }); }
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
          if (tamanho > MAX_ARQUIVO) { excedeu = true; req.unpipe(saida); saida.destroy(); req.resume(); return ok(); }
          hash.update(c);
          if (inicio.length < 16) inicio = Buffer.concat([inicio, c]).subarray(0, 16);
          fim = Buffer.concat([fim, c]); if (fim.length > 1024) fim = fim.subarray(fim.length - 1024);
        });
        req.pipe(saida);
        saida.on('finish', ok); saida.on('error', erro); req.on('error', erro);
      });
    } catch (e) { await arquivos.apagar(tmp); throw e; }
    if (excedeu) { await arquivos.apagar(tmp); return json(res, 413, { erro: 'muito_grande' }); }
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
      const r = await db.q(`insert into documentos(usuario_id, nome, tipo, tamanho, sha256, chave_arquivo, status, validado_em)
                            values ($1,$2,$3,$4,$5,$6,'disponivel_analise', now()) returning *`, [u.id, nome, tipo, tamanho, sha, chave]);
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
      res.writeHead(200, {
        'Content-Type': d.tipo, 'Content-Length': size, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
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
    const r = await db.q(`select id, tipo, descricao, to_char(data_solicitada, 'YYYY-MM-DD') as data_solicitada, horario_confirmado
                            from agendamentos where usuario_id=$1 order by coalesce(horario_confirmado, data_solicitada::timestamptz) desc nulls last`, [u.id]);
    return json(res, 200, { agendamentos: r.rows.map((a) => ({ id: a.id, tipo: a.tipo, descricao: a.descricao, dataSolicitada: a.data_solicitada, horarioConfirmado: a.horario_confirmado })) });
  }

  async function tratar(req, res, url) {
    const rota = url.pathname.replace(/\/+$/, '');
    const m = req.method;
    try {
      if (m !== 'GET' && m !== 'HEAD' && !origemValida(req)) return json(res, 403, { erro: 'origem' });
      if (rota === '/api/cliente/status' && m === 'GET') return json(res, 200, { ativo: true });
      if (rota === '/api/cliente/entrar' && m === 'POST') return await entrar(req, res);
      if (rota === '/api/cliente/sair' && m === 'POST') return await sair(req, res);
      if (rota === '/api/cliente/esqueci' && m === 'POST') return await esqueci(req, res);
      if (rota === '/api/cliente/redefinir' && m === 'POST') return await redefinir(req, res);
      const u = await autenticar(req);
      if (!u) return json(res, 401, { erro: 'sessao' }, { 'Set-Cookie': cookieApagar() });
      if (rota === '/api/cliente/sessao' && m === 'GET') return json(res, 200, { email: u.email, verificado: u.verificado });
      if (rota === '/api/cliente/perfil' && (m === 'GET' || m === 'PUT')) return await perfil(req, res, u);
      if (rota === '/api/cliente/documentos' && m === 'GET') return await listarDocumentos(res, u);
      if (rota === '/api/cliente/documentos' && m === 'POST') return await enviarDocumento(req, res, u);
      const dl = rota.match(/^\/api\/cliente\/documentos\/([^/]+)\/arquivo$/);
      if (dl && m === 'GET') return await baixarDocumento(res, u, dl[1]);
      if (rota === '/api/cliente/agendamentos' && m === 'GET') return await agendamentos(res, u);
      return json(res, 404, { erro: 'rota' });
    } catch (e) {
      if (e.status) return json(res, e.status, { erro: e.message });
      log.error('[area-cliente]', e);
      if (!res.headersSent) return json(res, 500, { erro: 'interno' });
      res.destroy();
    }
  }
  return { tratar, enviarLinkSenha };
}
