/**
 * Painel da equipe (rotas /api/cliente/equipe/*). Só para contas com papel de equipe ATIVO (conferido a cada
 * requisição); para qualquer outra conta as rotas respondem 404, como se não existissem.
 * Toda ação que altera algo fica registrada em acoes_equipe (quem, o quê, sobre quem, quando).
 * As regras de negócio são as mesmas dos comandos da equipe (admin.mjs): o painel só as expõe com segurança.
 */
import { EDITAVEIS, CAMPOS_PASSAPORTE, validarPassaporte } from './api.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATUS_DOC = ['disponivel_analise', 'aprovado', 'rejeitado'];
const STATUS_INT = ['novo', 'respondido', 'convidado', 'arquivado'];
const MOEDAS = ['AED', 'USD', 'EUR', 'GBP', 'BRL'];
const TIPOS_CONTA = ['digital', 'global', 'investimentos'];
const CLASSES = ['renda_fixa', 'renda_variavel', 'fundos', 'alternativos', 'exterior'];
const SITUACOES_CARTAO = ['ativo', 'bloqueado', 'em_emissao'];
/** "1.234,56" / "1234.56" / "-50" → centavos (BigInt) ou null. Até 13 dígitos inteiros. */
function centavos(v, { negativo = false } = {}) {
  let s = String(v ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');           // 28.750,00 · 1.350,5
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');            // 50.000 · 12.689 · 1.250.000 (milhar)
  else s = s.replace(/,/g, '');                                                       // 12480.5 · 28,750.00
  const m = /^(-)?(\d{1,13})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m || (m[1] && !negativo)) return null;
  const c = BigInt(m[2]) * 100n + BigInt((m[3] || '').padEnd(2, '0') || '0');
  return m[1] ? -c : c;
}
const dataValida = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };
const texto = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');

export function criarPainel({ db, adm, json, lerJson, log = console }) {
  const registrar = (u, acao, alvo, detalhes = {}) =>
    db.q('insert into acoes_equipe(por_usuario, por_email, acao, alvo, detalhes) values ($1,$2,$3,$4,$5::jsonb)', [u.id, u.email, acao, alvo || null, JSON.stringify(detalhes)]);
  const usuarioPorId = async (id) => {
    if (!UUID.test(id)) return null;
    return (await db.q('select id, email, senha_hash, bloqueado, idioma from usuarios where id=$1', [id])).rows[0] || null;
  };
  const erro = (res, status, codigo, mensagem) => json(res, status, { erro: codigo, mensagem });
  // corpo JSON sempre como objeto (null, número ou lista viram {})
  const corpo = async (req, max) => { const b = await lerJson(req, max); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };

  async function resumo(res) {
    const r = (await db.q(`select
        (select count(*) from usuarios u where not exists (select 1 from equipe e where e.usuario_id=u.id and e.ativo))::int as clientes,
        (select count(*) from usuarios where senha_hash is null)::int as convites_pendentes,
        (select count(*) from documentos where status='disponivel_analise')::int as documentos_em_analise,
        (select count(*) from agendamentos where horario_confirmado is null)::int as agendamentos_pendentes,
        (select count(*) from perfis where coalesce(dados->>'passportnumber','')<>'' and passaporte_conferido_em is null)::int as passaportes_a_conferir`)).rows[0];
    r.interessados_novos = (await db.q(`select count(*)::int n from interessados where status='novo'`)).rows[0].n;
    // painel inicial: só dados reais do sistema
    r.clientes_ativos = (await db.q(`select count(*)::int n from usuarios u where senha_hash is not null and not bloqueado
                                       and not exists (select 1 from equipe e where e.usuario_id=u.id and e.ativo)`)).rows[0].n;
    r.clientes_mes = (await db.q(`select to_char(m, 'YYYY-MM') as mes,
             (select count(*) from usuarios u where date_trunc('month', u.criado_em) = m
                and not exists (select 1 from equipe e where e.usuario_id=u.id and e.ativo))::int as n
        from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m order by m`)).rows;
    r.atividade = (await db.q(`select por_email, acao, alvo, em from acoes_equipe where acao <> 'ver_ficha' order by em desc limit 6`)).rows;
    r.proximos = (await db.q(`select a.id, u.email, p.dados->>'display_name' as nome, a.tipo, a.formato, a.horario_confirmado,
             to_char(a.data_solicitada,'YYYY-MM-DD') as data_solicitada
        from agendamentos a join usuarios u on u.id=a.usuario_id left join perfis p on p.usuario_id=u.id
       where (a.horario_confirmado is not null and a.horario_confirmado > now()) or (a.horario_confirmado is null and a.data_solicitada >= current_date)
       order by coalesce(a.horario_confirmado, a.data_solicitada::timestamptz) limit 5`)).rows;
    return json(res, 200, r);
  }

  async function listarClientes(res, url) {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
    const r = await db.q(`select u.id, u.email, u.idioma, u.bloqueado, u.criado_em, (u.senha_hash is not null) as ativo,
             coalesce(e.ativo, false) as equipe, p.dados->>'display_name' as nome,
             coalesce(p.dados->>'passportnumber','')<>'' as tem_passaporte, p.passaporte_conferido_em,
             (select count(*) from documentos d where d.usuario_id=u.id and d.status='disponivel_analise')::int as docs_em_analise,
             (select count(*) from agendamentos a where a.usuario_id=u.id and a.horario_confirmado is null)::int as agend_pendentes
        from usuarios u left join perfis p on p.usuario_id=u.id left join equipe e on e.usuario_id=u.id
       where $1 = '' or u.email like '%' || $1 || '%' or lower(coalesce(p.dados->>'display_name','')) like '%' || $1 || '%'
       order by u.criado_em desc limit 200`, [q]);
    return json(res, 200, { clientes: r.rows });
  }

  async function fichaCliente(res, u, id) {
    const c = await usuarioPorId(id);
    if (!c) return erro(res, 404, 'nao_encontrado');
    const p = (await db.q('select dados, passaporte_conferido_em, passaporte_conferido_por, atualizado_em from perfis where usuario_id=$1', [c.id])).rows[0] || {};
    const docs = (await db.q('select id, nome, tipo, tamanho, status, motivo, orientacao, recebido_em, decidido_por, decidido_em from documentos where usuario_id=$1 order by recebido_em desc', [c.id])).rows;
    const ags = (await db.q(`select id, tipo, descricao, formato, periodo, to_char(data_solicitada,'YYYY-MM-DD') as data_solicitada, horario_confirmado, confirmado_por, solicitado_pelo_cliente, criado_em
                               from agendamentos where usuario_id=$1 order by criado_em desc`, [c.id])).rows;
    const eq = (await db.q('select ativo from equipe where usuario_id=$1', [c.id])).rows[0];
    // o número completo do passaporte é mostrado só aqui (equipe) — e o acesso à ficha fica registrado
    await registrar(u, 'ver_ficha', c.email);
    return json(res, 200, {
      id: c.id, email: c.email, idioma: c.idioma, bloqueado: c.bloqueado, ativo: Boolean(c.senha_hash), equipe: Boolean(eq && eq.ativo),
      dados: p.dados || {}, passaporteConferidoEm: p.passaporte_conferido_em || null, passaporteConferidoPor: p.passaporte_conferido_por || null,
      documentos: docs, agendamentos: ags,
    });
  }

  async function convidar(req, res, u) {
    const b = await corpo(req, 4000);
    const email = String(b.email || '').trim().toLowerCase();
    const nome = typeof b.nome === 'string' ? b.nome.trim().slice(0, 120) : '';
    const idioma = b.idioma === 'en' ? 'en' : 'pt';
    // conta já existente: não mexe em nome/idioma nem reenvia por aqui (use a ficha, que respeita o bloqueio)
    if ((await db.q('select 1 from usuarios where email=$1', [email])).rowCount) return erro(res, 409, 'ja_existe', 'Este e-mail já tem conta. Abra a ficha do cliente para reenviar o acesso.');
    try {
      const r = await adm.convidar(email, { nome, lang: idioma });
      await registrar(u, 'convidar', email, { idioma });
      return json(res, 200, r);
    } catch (e) {
      if (/e-mail inválido/.test(e.message)) return erro(res, 400, 'email_invalido', 'E-mail inválido.');
      throw e;
    }
  }

  async function acaoCliente(req, res, u, id, acao) {
    const c = await usuarioPorId(id);
    if (!c) return erro(res, 404, 'nao_encontrado');
    if (c.id === u.id && acao === 'bloquear') return erro(res, 409, 'proprio_usuario', 'Você não pode bloquear a sua própria conta.');
    if (acao === 'bloquear' && (await db.q('select 1 from equipe where usuario_id=$1 and ativo', [c.id])).rowCount)
      return erro(res, 409, 'conta_equipe', 'Contas da equipe não são bloqueadas pelo painel.');
    let r;
    try {
      if (acao === 'bloquear') r = await adm.bloquear(c.email);
      else if (acao === 'desbloquear') r = await adm.desbloquear(c.email);
      else if (acao === 'reenviar') {
        if (c.bloqueado) return erro(res, 409, 'bloqueado', 'Desbloqueie a conta antes de reenviar o acesso.');
        r = await adm.convidar(c.email, { lang: c.idioma });
      }
      else if (acao === 'passaporte-conferir') r = await adm.conferirPassaporte(c.email, u.email);
      else if (acao === 'passaporte-liberar') r = await adm.liberarPassaporte(c.email);
      else return erro(res, 404, 'rota');
    } catch (e) {
      if (/ainda não informou/.test(e.message)) return erro(res, 409, 'sem_passaporte', 'O cliente ainda não informou o número do passaporte.');
      throw e;
    }
    await registrar(u, acao.replace('-', '_'), c.email);
    if (r && r.numero) delete r.numero;            // a resposta não precisa repetir o número completo
    return json(res, 200, r);
  }

  /**
   * Equipe corrige dados cadastrais do cliente (mesmos campos e limites da Área do Cliente, mais o passaporte).
   * Passaporte gravado pela equipe fica como CONFERIDO por ela. O registro guarda QUAIS campos mudaram (não os valores).
   */
  async function editarDados(req, res, u, id) {
    const c = await usuarioPorId(id);
    if (!c) return erro(res, 404, 'nao_encontrado');
    const b = await corpo(req, 20000);
    const alteracoes = {};
    for (const [k, v] of Object.entries(b)) {
      if (CAMPOS_PASSAPORTE.includes(k)) {
        const val = typeof v === 'string' && v.length <= 40 ? validarPassaporte(k, v.trim()) : null;
        if (val === null) return erro(res, 400, 'valor_invalido', k === 'passportnumber' ? 'Número do passaporte inválido (5 a 20 letras e números).' : 'Validade do passaporte inválida.');
        alteracoes[k] = val; continue;
      }
      if (!Object.hasOwn(EDITAVEIS, k)) return erro(res, 400, 'campo_nao_permitido', 'Campo não permitido.');
      if (typeof v !== 'string' || v.length > EDITAVEIS[k]) return erro(res, 400, 'valor_invalido', 'Valor muito longo ou inválido.');
      alteracoes[k] = v.trim();
    }
    const atual = ((await db.q('select dados from perfis where usuario_id=$1', [c.id])).rows[0] || {}).dados || {};
    const mudou = Object.keys(alteracoes).filter((k) => (atual[k] ?? '') !== alteracoes[k]);
    if (!mudou.length) return json(res, 200, { alterados: [] });
    const so = Object.fromEntries(mudou.map((k) => [k, alteracoes[k]]));
    const passaporte = mudou.some((k) => CAMPOS_PASSAPORTE.includes(k));
    await db.q(`insert into perfis(usuario_id, dados${passaporte ? ', passaporte_conferido_em, passaporte_conferido_por' : ''})
                values ($1, $2::jsonb${passaporte ? ', now(), $3' : ''})
                on conflict (usuario_id) do update set dados = perfis.dados || excluded.dados, atualizado_em = now()
                ${passaporte ? ', passaporte_conferido_em = now(), passaporte_conferido_por = $3' : ''}`,
      passaporte ? [c.id, JSON.stringify(so), u.email] : [c.id, JSON.stringify(so)]);
    await registrar(u, 'editar_dados', c.email, { campos: mudou });
    return json(res, 200, { alterados: mudou });
  }

  // ---- financeiro do cliente (lançado pela equipe; o cliente só consulta)
  async function lerFinanceiro(res, u, id) {
    const c = await usuarioPorId(id); if (!c) return erro(res, 404, 'nao_encontrado');
    const contas = (await db.q(`select id, tipo, moeda, saldo_centavos::text as saldo, atualizado_em, atualizado_por from contas_cliente where usuario_id=$1 order by tipo, moeda`, [c.id])).rows;
    const movimentos = (await db.q(`select m.id, m.conta_id, to_char(m.data,'YYYY-MM-DD') as data, m.descricao, m.valor_centavos::text as valor, m.criado_por, m.criado_em, c.tipo as conta_tipo, c.moeda
                                      from movimentos_cliente m join contas_cliente c on c.id=m.conta_id where m.usuario_id=$1 order by m.data desc, m.criado_em desc limit 200`, [c.id])).rows;
    const posicoes = (await db.q(`select id, classe, descricao, moeda, valor_centavos::text as valor, atualizado_em, atualizado_por from posicoes_cliente where usuario_id=$1 order by classe, descricao`, [c.id])).rows;
    const cartao = (await db.q(`select final, bandeira, situacao, moeda, limite_centavos::text as limite, fatura_centavos::text as fatura, to_char(vencimento,'YYYY-MM-DD') as vencimento, atualizado_em, atualizado_por from cartoes_cliente where usuario_id=$1`, [c.id])).rows[0] || null;
    return json(res, 200, { contas, movimentos, posicoes, cartao });
  }
  async function salvarConta(req, res, u, id) {
    const c = await usuarioPorId(id); if (!c) return erro(res, 404, 'nao_encontrado');
    const b = await corpo(req, 2000);
    const saldo = centavos(b.saldo, { negativo: true });
    if (!TIPOS_CONTA.includes(b.tipo) || !MOEDAS.includes(b.moeda) || saldo === null) return erro(res, 400, 'valor_invalido', 'Confira o tipo de conta, a moeda e o saldo.');
    if (b.id !== undefined && b.id !== null && b.id !== '') {
      if (!UUID.test(String(b.id))) return erro(res, 404, 'nao_encontrado');
      try {
        const up = await db.q('update contas_cliente set tipo=$3, moeda=$4, saldo_centavos=$5, atualizado_em=now(), atualizado_por=$6 where id=$1 and usuario_id=$2 returning id', [b.id, c.id, b.tipo, b.moeda, saldo.toString(), u.email]);
        if (!up.rowCount) return erro(res, 404, 'nao_encontrado');
      } catch (e) { if (e.code === '23505') return erro(res, 409, 'conta_duplicada', 'Este cliente já tem uma conta desse tipo nessa moeda.'); throw e; }
      await registrar(u, 'financeiro_conta', c.email, { tipo: b.tipo, moeda: b.moeda, correcao: true });
      return json(res, 200, { id: b.id });
    }
    const r = await db.q(`insert into contas_cliente(usuario_id, tipo, moeda, saldo_centavos, atualizado_por) values ($1,$2,$3,$4,$5)
                          on conflict (usuario_id, tipo, moeda) do update set saldo_centavos=excluded.saldo_centavos, atualizado_em=now(), atualizado_por=excluded.atualizado_por returning id`,
      [c.id, b.tipo, b.moeda, saldo.toString(), u.email]);
    await registrar(u, 'financeiro_conta', c.email, { tipo: b.tipo, moeda: b.moeda });
    return json(res, 200, { id: r.rows[0].id });
  }
  async function excluirConta(req, res, u, id, contaId) {
    const c = await usuarioPorId(id); if (!c || !UUID.test(contaId)) return erro(res, 404, 'nao_encontrado');
    const r = await db.q('delete from contas_cliente where id=$1 and usuario_id=$2 returning tipo, moeda', [contaId, c.id]);
    if (!r.rowCount) return erro(res, 404, 'nao_encontrado');
    await registrar(u, 'financeiro_conta_excluida', c.email, r.rows[0]);
    return json(res, 200, { ok: true });
  }
  async function lancarMovimento(req, res, u, id) {
    const c = await usuarioPorId(id); if (!c) return erro(res, 404, 'nao_encontrado');
    const b = await corpo(req, 4000);
    const valor = centavos(b.valor, { negativo: true });
    const descricao = texto(b.descricao, 140);
    if (!UUID.test(String(b.contaId || '')) || !dataValida(b.data) || !descricao || valor === null || valor === 0n) return erro(res, 400, 'valor_invalido', 'Confira a conta, a data, a descrição e o valor.');
    // lança e atualiza o saldo da conta na MESMA transação (trava a conta para lançamentos simultâneos)
    const r = await db.transacao(async (q) => {
      const conta = (await q('select id from contas_cliente where id=$1 and usuario_id=$2 for update', [b.contaId, c.id])).rows[0];
      if (!conta) return null;
      const mov = await q('insert into movimentos_cliente(usuario_id, conta_id, data, descricao, valor_centavos, criado_por, aplicado_no_saldo) values ($1,$2,$3,$4,$5,$6,true) returning id', [c.id, conta.id, b.data, descricao, valor.toString(), u.email]);
      const s = await q('update contas_cliente set saldo_centavos = saldo_centavos + $2::bigint, atualizado_em=now(), atualizado_por=$3 where id=$1 returning saldo_centavos::text as saldo', [conta.id, valor.toString(), u.email]);
      return { id: mov.rows[0].id, saldo: s.rows[0].saldo };
    });
    if (!r) return erro(res, 400, 'conta_invalida', 'Conta não encontrada para este cliente.');
    await registrar(u, 'financeiro_movimento', c.email, { data: b.data });
    return json(res, 201, r);
  }
  async function excluirMovimento(req, res, u, id, movId) {
    const c = await usuarioPorId(id); if (!c || !UUID.test(movId)) return erro(res, 404, 'nao_encontrado');
    // exclui e desfaz o efeito no saldo (só se aquele lançamento tinha sido somado ao saldo)
    const r = await db.transacao(async (q) => {
      const m = (await q('select conta_id, valor_centavos::text as v, aplicado_no_saldo from movimentos_cliente where id=$1 and usuario_id=$2', [movId, c.id])).rows[0];
      if (!m) return { rowCount: 0 };
      await q('select id from contas_cliente where id=$1 for update', [m.conta_id]);
      const d = await q('delete from movimentos_cliente where id=$1 and usuario_id=$2', [movId, c.id]);
      if (d.rowCount && m.aplicado_no_saldo) await q('update contas_cliente set saldo_centavos = saldo_centavos - $2::bigint, atualizado_em=now(), atualizado_por=$3 where id=$1', [m.conta_id, m.v, u.email]);
      return d;
    });
    if (!r.rowCount) return erro(res, 404, 'nao_encontrado');
    await registrar(u, 'financeiro_movimento_excluido', c.email);
    return json(res, 200, { ok: true });
  }
  async function corrigirMovimento(req, res, u, id, movId) {
    const c = await usuarioPorId(id); if (!c || !UUID.test(movId)) return erro(res, 404, 'nao_encontrado');
    const b = await corpo(req, 4000);
    const valor = centavos(b.valor, { negativo: true });
    const descricao = texto(b.descricao, 140);
    if (!UUID.test(String(b.contaId || '')) || !dataValida(b.data) || !descricao || valor === null || valor === 0n) return erro(res, 400, 'valor_invalido', 'Confira a conta, a data, a descrição e o valor.');
    const r = await db.transacao(async (q) => {
      const m = (await q('select conta_id, valor_centavos::text as v, aplicado_no_saldo from movimentos_cliente where id=$1 and usuario_id=$2 for update', [movId, c.id])).rows[0];
      if (!m) return 404;
      // trava as contas envolvidas sempre na mesma ordem (evita impasse)
      const ids = [...new Set([m.conta_id, b.contaId])].sort();
      const contas = (await q('select id from contas_cliente where id = any($1::uuid[]) and usuario_id=$2 order by id for update', [ids, c.id])).rows;
      if (!contas.some((k) => k.id === b.contaId)) return 400;
      if (m.aplicado_no_saldo) {
        await q('update contas_cliente set saldo_centavos = saldo_centavos - $2::bigint, atualizado_em=now(), atualizado_por=$3 where id=$1', [m.conta_id, m.v, u.email]);
        await q('update contas_cliente set saldo_centavos = saldo_centavos + $2::bigint, atualizado_em=now(), atualizado_por=$3 where id=$1', [b.contaId, valor.toString(), u.email]);
      }
      await q('update movimentos_cliente set conta_id=$2, data=$3, descricao=$4, valor_centavos=$5 where id=$1', [movId, b.contaId, b.data, descricao, valor.toString()]);
      return 200;
    });
    if (r === 404) return erro(res, 404, 'nao_encontrado');
    if (r === 400) return erro(res, 400, 'conta_invalida', 'Conta não encontrada para este cliente.');
    await registrar(u, 'financeiro_movimento_corrigido', c.email, { data: b.data });
    return json(res, 200, { ok: true });
  }
  async function salvarPosicao(req, res, u, id) {
    const c = await usuarioPorId(id); if (!c) return erro(res, 404, 'nao_encontrado');
    const b = await corpo(req, 3000);
    const valor = centavos(b.valor);
    const descricao = texto(b.descricao, 120);
    if (!CLASSES.includes(b.classe) || !MOEDAS.includes(b.moeda) || !descricao || valor === null) return erro(res, 400, 'valor_invalido', 'Confira a classe, a descrição, a moeda e o valor.');
    let r;
    if (b.id) {
      if (!UUID.test(String(b.id))) return erro(res, 404, 'nao_encontrado');
      r = await db.q('update posicoes_cliente set classe=$3, descricao=$4, moeda=$5, valor_centavos=$6, atualizado_em=now(), atualizado_por=$7 where id=$1 and usuario_id=$2 returning id', [b.id, c.id, b.classe, descricao, b.moeda, valor.toString(), u.email]);
      if (!r.rowCount) return erro(res, 404, 'nao_encontrado');
    } else {
      r = await db.q('insert into posicoes_cliente(usuario_id, classe, descricao, moeda, valor_centavos, atualizado_por) values ($1,$2,$3,$4,$5,$6) returning id', [c.id, b.classe, descricao, b.moeda, valor.toString(), u.email]);
    }
    await registrar(u, 'financeiro_posicao', c.email, { classe: b.classe });
    return json(res, 200, { id: r.rows[0].id });
  }
  async function excluirPosicao(req, res, u, id, posId) {
    const c = await usuarioPorId(id); if (!c || !UUID.test(posId)) return erro(res, 404, 'nao_encontrado');
    const r = await db.q('delete from posicoes_cliente where id=$1 and usuario_id=$2 returning classe', [posId, c.id]);
    if (!r.rowCount) return erro(res, 404, 'nao_encontrado');
    await registrar(u, 'financeiro_posicao_excluida', c.email);
    return json(res, 200, { ok: true });
  }
  async function salvarCartao(req, res, u, id) {
    const c = await usuarioPorId(id); if (!c) return erro(res, 404, 'nao_encontrado');
    const b = await corpo(req, 2000);
    if (b.remover === true) {
      await db.q('delete from cartoes_cliente where usuario_id=$1', [c.id]);
      await registrar(u, 'financeiro_cartao_removido', c.email);
      return json(res, 200, { ok: true });
    }
    const limite = b.limite === '' || b.limite == null ? null : centavos(b.limite);
    const fatura = b.fatura === '' || b.fatura == null ? null : centavos(b.fatura);
    if (!/^\d{4}$/.test(String(b.final || '')) || !SITUACOES_CARTAO.includes(b.situacao) || !MOEDAS.includes(b.moeda) || (b.limite && limite === null) || (b.fatura && fatura === null) || (b.vencimento && !dataValida(b.vencimento)))
      return erro(res, 400, 'valor_invalido', 'Confira os 4 últimos dígitos, a situação, a moeda, os valores e o vencimento.');
    await db.q(`insert into cartoes_cliente(usuario_id, final, bandeira, situacao, moeda, limite_centavos, fatura_centavos, vencimento, atualizado_por)
                values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                on conflict (usuario_id) do update set final=excluded.final, bandeira=excluded.bandeira, situacao=excluded.situacao, moeda=excluded.moeda,
                  limite_centavos=excluded.limite_centavos, fatura_centavos=excluded.fatura_centavos, vencimento=excluded.vencimento, atualizado_em=now(), atualizado_por=excluded.atualizado_por`,
      [c.id, b.final, texto(b.bandeira, 30) || null, b.situacao, b.moeda, limite === null ? null : limite.toString(), fatura === null ? null : fatura.toString(), b.vencimento || null, u.email]);
    await registrar(u, 'financeiro_cartao', c.email);
    return json(res, 200, { ok: true });
  }

  // ---- interessados (formulários do site)
  async function listarInteressados(res, url) {
    const st = url.searchParams.get('status');
    const status = STATUS_INT.includes(st) ? st : null;
    const r = await db.q(`select i.*, exists (select 1 from usuarios u where u.email = i.email) as tem_conta
                            from interessados i ${status ? 'where i.status=$1' : ''} order by i.recebido_em desc limit 300`, status ? [status] : []);
    return json(res, 200, { interessados: r.rows });
  }
  async function statusInteressado(req, res, u, id) {
    if (!UUID.test(id)) return erro(res, 404, 'nao_encontrado');
    const b = await corpo(req, 2000);
    if (!['novo', 'respondido', 'arquivado'].includes(b.status)) return erro(res, 400, 'status_invalido');
    const r = await db.q('update interessados set status=$2, atualizado_em=now(), atualizado_por=$3 where id=$1 returning email', [id, b.status, u.email]);
    if (!r.rowCount) return erro(res, 404, 'nao_encontrado');
    await registrar(u, 'interessado_' + b.status, r.rows[0].email);
    return json(res, 200, { status: b.status });
  }
  async function convidarInteressado(req, res, u, id) {
    if (!UUID.test(id)) return erro(res, 404, 'nao_encontrado');
    const i = (await db.q('select * from interessados where id=$1', [id])).rows[0];
    if (!i) return erro(res, 404, 'nao_encontrado');
    const existente = (await db.q('select id from usuarios where email=$1', [i.email])).rows[0];
    if (existente) {
      await db.q(`update interessados set status='convidado', usuario_id=$2, atualizado_em=now(), atualizado_por=$3 where id=$1`, [id, existente.id, u.email]);
      return erro(res, 409, 'ja_existe', 'Este e-mail já tem conta na Área do Cliente. Abra a ficha em Clientes.');
    }
    const r = await adm.convidar(i.email, { nome: i.nome, lang: i.idioma });
    await db.q(`update interessados set status='convidado', usuario_id=$2, atualizado_em=now(), atualizado_por=$3 where id=$1`, [id, r.id, u.email]);
    await registrar(u, 'convidar', i.email, { idioma: i.idioma, origem: 'interessado' });
    return json(res, 200, r);
  }

  async function listarAgendamentos(res, url) {
    const todos = url.searchParams.get('todos') === '1';
    const r = await db.q(`select a.id, u.id as cliente_id, u.email, p.dados->>'display_name' as nome, a.tipo, a.descricao, a.formato, a.periodo,
             to_char(a.data_solicitada,'YYYY-MM-DD') as data_solicitada, a.horario_confirmado, a.confirmado_por, a.solicitado_pelo_cliente, a.criado_em
        from agendamentos a join usuarios u on u.id=a.usuario_id left join perfis p on p.usuario_id=u.id
       ${todos ? '' : 'where a.horario_confirmado is null'}
       order by ${todos ? 'a.criado_em desc' : 'a.data_solicitada nulls last, a.criado_em'} limit 300`);
    return json(res, 200, { agendamentos: r.rows });
  }
  async function confirmarAgendamento(req, res, u, id) {
    if (!UUID.test(id)) return erro(res, 404, 'nao_encontrado');
    const b = await corpo(req, 2000);
    try {
      const r = await adm.confirmarAgendamento(id, String(b.dataHora || ''), u.email, { avisar: b.avisar !== false });
      await registrar(u, 'confirmar_agendamento', id, { dataHora: b.dataHora, email: r.emailCliente });
      return json(res, 200, r);
    } catch (e) {
      if (/não encontrado/.test(e.message)) return erro(res, 404, 'nao_encontrado');
      if (/já confirmado/.test(e.message)) return erro(res, 409, 'ja_confirmado', 'Este agendamento já foi confirmado (por outra pessoa ou em outra aba). Atualize a lista.');
      if (/AAAA|inexistente|inválida/.test(e.message)) return erro(res, 400, 'data_hora_invalida', 'Data ou hora inválida.');
      throw e;
    }
  }

  async function listarDocumentos(res, url) {
    const st = url.searchParams.get('status');
    const status = STATUS_DOC.includes(st) ? st : null;
    const r = await db.q(`select d.id, u.id as cliente_id, u.email, p.dados->>'display_name' as nome, d.nome as arquivo, d.tipo, d.tamanho, d.status, d.motivo,
             d.orientacao, d.recebido_em, d.decidido_por, d.decidido_em, (d.chave_arquivo is not null) as tem_arquivo
        from documentos d join usuarios u on u.id=d.usuario_id left join perfis p on p.usuario_id=u.id
       ${status ? 'where d.status=$1' : ''} order by d.recebido_em ${status === 'disponivel_analise' ? 'asc' : 'desc'} limit 300`, status ? [status] : []);
    return json(res, 200, { documentos: r.rows });
  }
  async function decidirDocumento(req, res, u, id) {
    if (!UUID.test(id)) return erro(res, 404, 'nao_encontrado');
    const b = await corpo(req, 6000);
    const decisao = b.decisao;
    const pt = typeof b.orientacaoPt === 'string' ? b.orientacaoPt.trim().slice(0, 1000) : '';
    const en = typeof b.orientacaoEn === 'string' ? b.orientacaoEn.trim().slice(0, 1000) : '';
    if (!['aprovado', 'rejeitado'].includes(decisao)) return erro(res, 400, 'decisao_invalida');
    if (decisao === 'rejeitado' && !pt) return erro(res, 400, 'orientacao_obrigatoria', 'Escreva a orientação para o cliente.');
    try {
      const r = await adm.decidir(id, decisao, { orientacaoPt: pt, orientacaoEn: en || undefined, por: u.email });
      await registrar(u, decisao === 'aprovado' ? 'aprovar_documento' : 'rejeitar_documento', id);
      return json(res, 200, r);
    } catch (e) {
      if (/só documentos/.test(e.message)) return erro(res, 409, 'ja_decidido', 'Este documento já foi decidido.');
      throw e;
    }
  }

  async function registro(res) {
    const r = await db.q('select por_email, acao, alvo, detalhes, em from acoes_equipe order by em desc limit 200');
    return json(res, 200, { acoes: r.rows });
  }

  /** Despacha /api/cliente/equipe/*; `u` já autenticado. Conta sem papel de equipe → 404. */
  return async function tratarPainel(req, res, url, u) {
    if (!u.equipe) return json(res, 404, { erro: 'rota' });
    const m = req.method;
    const p = url.pathname.replace(/\/+$/, '').slice('/api/cliente/equipe'.length).split('/').filter(Boolean);
    if (m === 'GET' && p[0] === 'resumo' && p.length === 1) return resumo(res);
    if (p[0] === 'clientes') {
      if (p.length === 1 && m === 'GET') return listarClientes(res, url);
      if (p.length === 1 && m === 'POST') return convidar(req, res, u);
      if (p.length === 2 && m === 'GET') return fichaCliente(res, u, p[1]);
      if (p.length === 3 && p[2] === 'dados' && m === 'PUT') return editarDados(req, res, u, p[1]);
      if (p[2] === 'financeiro' && p.length === 3 && m === 'GET') return lerFinanceiro(res, u, p[1]);
      if (p[2] === 'contas' && p.length === 3 && m === 'PUT') return salvarConta(req, res, u, p[1]);
      if (p[2] === 'contas' && p.length === 4 && m === 'DELETE') return excluirConta(req, res, u, p[1], p[3]);
      if (p[2] === 'movimentos' && p.length === 3 && m === 'POST') return lancarMovimento(req, res, u, p[1]);
      if (p[2] === 'movimentos' && p.length === 4 && m === 'DELETE') return excluirMovimento(req, res, u, p[1], p[3]);
      if (p[2] === 'movimentos' && p.length === 4 && m === 'PUT') return corrigirMovimento(req, res, u, p[1], p[3]);
      if (p[2] === 'posicoes' && p.length === 3 && m === 'PUT') return salvarPosicao(req, res, u, p[1]);
      if (p[2] === 'posicoes' && p.length === 4 && m === 'DELETE') return excluirPosicao(req, res, u, p[1], p[3]);
      if (p[2] === 'cartao' && p.length === 3 && m === 'PUT') return salvarCartao(req, res, u, p[1]);
      if (p.length === 3 && m === 'POST') return acaoCliente(req, res, u, p[1], p[2]);
    }
    if (p[0] === 'agendamentos') {
      if (p.length === 1 && m === 'GET') return listarAgendamentos(res, url);
      if (p.length === 3 && p[2] === 'confirmar' && m === 'POST') return confirmarAgendamento(req, res, u, p[1]);
    }
    if (p[0] === 'documentos') {
      if (p.length === 1 && m === 'GET') return listarDocumentos(res, url);
      if (p.length === 3 && p[2] === 'decidir' && m === 'POST') return decidirDocumento(req, res, u, p[1]);
    }
    if (p[0] === 'interessados') {
      if (p.length === 1 && m === 'GET') return listarInteressados(res, url);
      if (p.length === 3 && p[2] === 'status' && m === 'POST') return statusInteressado(req, res, u, p[1]);
      if (p.length === 3 && p[2] === 'convidar' && m === 'POST') return convidarInteressado(req, res, u, p[1]);
    }
    if (p[0] === 'registro' && p.length === 1 && m === 'GET') return registro(res);
    return json(res, 404, { erro: 'rota' });
  };
}
