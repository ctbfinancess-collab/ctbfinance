/**
 * Instrumentos financeiros internacionais (SBLC, LC, BG…) — SOMENTE solicitação, análise e acompanhamento.
 *
 * O que este módulo NUNCA faz: emitir garantia, gerar mensagem SWIFT, simular aprovação bancária,
 * movimentar recursos, cobrar comissão ou alterar saldos/posições. "Aprovada" e "Concluída" só podem ser
 * marcadas por quem tem equipe.aprova_instrumentos, e só com um comprovante (evidência) anexado pela equipe.
 *
 * Cliente:  /api/cliente/instrumentos[...]           (só as próprias solicitações; outra cliente → 404)
 * Equipe:   /api/cliente/equipe/instrumentos[...]    (via painel.mjs; tudo registrado em acoes_equipe)
 */
import { valorCentavos } from './api.mjs';

export const GARANTIAS = { SBLC: 'Standby Letter of Credit', LC: 'Letter of Credit', DLC: 'Documentary Letter of Credit', BG: 'Bank Guarantee', PBG: 'Performance Bank Guarantee', APG: 'Advance Payment Guarantee', BB: 'Bid Bond', LG: 'Letter of Guarantee', FC: 'Financial Guarantee' };
export const DECLARACOES = { RWA: 'Ready, Willing and Able', BCL: 'Bank Comfort Letter', POF: 'Proof of Funds' };
export const MOEDAS_INSTRUMENTO = ['USD', 'EUR', 'AED', 'GBP'];
export const STATUS_INSTRUMENTO = ['rascunho', 'enviada', 'analise_documental', 'documentacao_solicitada', 'analise_interna', 'encaminhada', 'aguardando_instituicao', 'aprovada', 'recusada', 'cancelada', 'concluida'];
export const STATUS_PT = {
  rascunho: 'Rascunho', enviada: 'Solicitação enviada', analise_documental: 'Em análise documental', documentacao_solicitada: 'Documentação complementar solicitada',
  analise_interna: 'Em análise interna', encaminhada: 'Encaminhada à instituição financeira', aguardando_instituicao: 'Aguardando resposta da instituição',
  aprovada: 'Aprovada pela instituição', recusada: 'Recusada', cancelada: 'Cancelada', concluida: 'Concluída',
};
const FINAIS = ['recusada', 'cancelada', 'concluida'];
// 'enviada' = ainda não entrou em análise: a cliente pode corrigir e reenviar (sempre completa)
const EDITAVEL_CLIENTE = ['rascunho', 'enviada', 'documentacao_solicitada'];
// transições que a EQUIPE pode fazer (rascunho é da cliente: a equipe não vê nem mexe).
// "Aprovada" pode vir de qualquer etapa em aberto (a pedido da titular), mas só pela aprovadora e com comprovante anexado.
const TRANSICOES = {
  enviada: ['analise_documental', 'documentacao_solicitada', 'analise_interna', 'aprovada', 'recusada', 'cancelada'],
  analise_documental: ['documentacao_solicitada', 'analise_interna', 'aprovada', 'recusada', 'cancelada'],
  documentacao_solicitada: ['analise_documental', 'analise_interna', 'aprovada', 'recusada', 'cancelada'],
  analise_interna: ['analise_documental', 'documentacao_solicitada', 'encaminhada', 'aprovada', 'recusada', 'cancelada'],
  encaminhada: ['aguardando_instituicao', 'aprovada', 'recusada', 'cancelada'],
  aguardando_instituicao: ['documentacao_solicitada', 'aprovada', 'recusada', 'cancelada'],
  aprovada: ['concluida', 'cancelada'],
  rascunho: [], recusada: [], cancelada: [], concluida: [],
};
const ABERTAS_MAX = 10;        // solicitações não finalizadas (inclui rascunhos) por cliente
const CRIADAS_DIA_MAX = 10;    // novas solicitações por cliente em 24 h
const MENSAGENS_DIA_MAX = 30;  // mensagens da cliente por dia (todas as solicitações)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const txt = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');
const dataValida = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };
const erroHttp = (status, codigo, extra = {}) => Object.assign(new Error(codigo), { status, extra });

/** Campos que a cliente pode preencher (rascunho aceita incompleto; o envio exige os obrigatórios). */
function lerCampos(b) {
  const e = {};
  const out = {};
  if (b.instrumento !== undefined) { if (!GARANTIAS[b.instrumento] && !DECLARACOES[b.instrumento]) e.instrumento = 1; else out.instrumento = b.instrumento; }
  if (b.moeda !== undefined) { if (!MOEDAS_INSTRUMENTO.includes(b.moeda)) e.moeda = 1; else out.moeda = b.moeda; }
  if (b.valor !== undefined) {
    if (b.valor === null || String(b.valor).trim() === '') out.valor_centavos = null;
    else { const v = valorCentavos(b.valor); if (v === null || v <= 0n) e.valor = 1; else out.valor_centavos = v.toString(); }
  }
  if (b.validade !== undefined) { if (!b.validade) out.validade = null; else if (!dataValida(b.validade)) e.validade = 1; else out.validade = b.validade; }
  const bn = b.beneficiario && typeof b.beneficiario === 'object' ? b.beneficiario : null;
  if (bn) out.beneficiario = { nome: txt(bn.nome, 160), pais: txt(bn.pais, 80), endereco: txt(bn.endereco, 200), banco: txt(bn.banco, 160) };
  // ordenante: a cliente só ESCOLHE (pessoa física ou a empresa dela); nome/documento vêm do perfil, no servidor
  const od = b.ordenante && typeof b.ordenante === 'object' ? b.ordenante : null;
  if (od) { if (!['pf', 'pj'].includes(od.tipo)) e.ordenante = 1; else out.ordenante = { tipo: od.tipo }; }
  for (const [k, n] of [['finalidade', 1000], ['banco_emissor', 160], ['banco_avisador', 160], ['operacao_subjacente', 1000], ['contrato_ref', 160], ['observacoes', 2000]]) {
    const chave = { banco_emissor: 'bancoEmissor', banco_avisador: 'bancoAvisador', operacao_subjacente: 'operacaoSubjacente', contrato_ref: 'contratoRef' }[k] || k;
    if (b[chave] !== undefined) out[k] = txt(b[chave], n) || null;
  }
  return { out, invalidos: Object.keys(e) };
}
/** Dados do ordenante tirados do perfil ("Meu perfil"): pessoa física ou a empresa (PJ) da cliente. */
const s_ = (v) => (typeof v === 'string' ? v.trim() : '');
export function ordenanteDoPerfil(tipo, p) {
  p = p || {};
  if (tipo === 'pf') {
    if (!s_(p.display_name)) return null;
    return { tipo: 'pf', nome: s_(p.display_name), identificacao: s_(p.passportnumber), passaporte: s_(p.passportnumber), nacionalidade: s_(p.nationality) };
  }
  if (tipo === 'pj') {
    if (!s_(p.CompanyName)) return null;
    const endereco = [[s_(p.companysadress), s_(p.companyaddressnumber)].filter(Boolean).join(', '), s_(p.companycity), s_(p.companyzipcode), s_(p.companycountry)].filter(Boolean).join(', ');
    return { tipo: 'pj', nome: s_(p.CompanyName), identificacao: s_(p.Companyregistrationnumber), registro: s_(p.Companyregistrationnumber), pais: s_(p.companycountry),
      endereco, representante: s_(p.display_name), cargo: s_(p.companyposition) };
  }
  return null;
}
/** O que a cliente vê do ordenante (passaporte mascarado, como em "Meu perfil"). */
const mascarar = (o) => {
  if (!o || o.tipo !== 'pf' || !o.passaporte) return o;
  const m = '•••• ' + o.passaporte.slice(-3);
  return { ...o, passaporte: m, identificacao: m };
};
/** Campos obrigatórios para ENVIAR (lista vazia = pode enviar). `perfil` = dados de "Meu perfil" da cliente. */
function faltando(s, perfil) {
  const f = [];
  if (!s.instrumento) f.push('instrumento');
  if (!s.moeda) f.push('moeda');
  if (!s.valor) f.push('valor');
  if (!s.beneficiario?.nome) f.push('beneficiarioNome');
  if (!s.beneficiario?.pais) f.push('beneficiarioPais');
  if (!s.finalidade) f.push('finalidade');
  const o = s.ordenante || {};
  if (o.tipo === 'pf' || o.tipo === 'pj') { if (!ordenanteDoPerfil(o.tipo, perfil)) f.push(o.tipo === 'pj' ? 'ordenanteEmpresa' : 'ordenantePerfil'); }
  else if (!o.nome) f.push('ordenante');   // rascunho antigo com nome digitado continua valendo
  return f;
}
const COLS = `s.id, s.referencia, s.instrumento, s.categoria, s.moeda, s.valor_centavos::text as valor, s.beneficiario, s.ordenante, s.finalidade,
  s.banco_emissor, s.banco_avisador, to_char(s.validade,'YYYY-MM-DD') as validade, s.operacao_subjacente, s.contrato_ref, s.observacoes, s.status,
  s.criado_em, s.enviado_em, s.atualizado_em`;

export function criarInstrumentos({ db, json, lerJson, receberArquivo, avisarEquipe = null, aoStatus = null, log = console }) {
  const corpo = async (req, max = 12000) => { const b = await lerJson(req, max); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
  const evento = (q, sid, e) => q(`insert into instrumentos_eventos(solicitacao_id, tipo, status_de, status_para, texto, visivel_cliente, documento_id, por_email, por_equipe)
                                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [sid, e.tipo, e.de || null, e.para || null, e.texto || null, e.visivel, e.documento || null, e.por, e.equipe]);
  const responder = (res, e) => { if (e.status) return json(res, e.status, { erro: e.message, ...e.extra }); throw e; };

  // ============================================================== CLIENTE
  const perfilDe = async (q, id) => (await q('select dados from perfis where usuario_id=$1', [id])).rows[0]?.dados || {};
  async function listarDoCliente(res, u) {
    const sols = (await db.q(`select ${COLS} from instrumentos_solicitacoes s where s.usuario_id=$1 order by s.criado_em desc limit 50`, [u.id])).rows;
    const perfil = await perfilDe(db.q, u.id);
    if (sols.length) {
      const ids = sols.map((s) => s.id);
      const ev = (await db.q(`select solicitacao_id, tipo, status_de, status_para, texto, por_equipe, em from instrumentos_eventos
                               where solicitacao_id = any($1::uuid[]) and visivel_cliente order by em, id`, [ids])).rows;
      // anexos da própria cliente (os comprovantes internos da equipe não são listados para ela)
      const ax = (await db.q(`select a.solicitacao_id, d.id, d.nome, d.tipo, d.tamanho, a.tipo as tipo_anexo, a.em from instrumentos_anexos a join documentos d on d.id=a.documento_id
                               where a.solicitacao_id = any($1::uuid[]) and not a.por_equipe order by a.em`, [ids])).rows;
      for (const s of sols) {
        s.eventos = ev.filter((x) => x.solicitacao_id === s.id).map(({ solicitacao_id, ...x }) => x);
        s.anexos = ax.filter((x) => x.solicitacao_id === s.id).map(({ solicitacao_id, ...x }) => x);
        s.faltando = EDITAVEL_CLIENTE.includes(s.status) ? faltando(s, perfil) : [];
        s.ordenante = mascarar(s.ordenante);
      }
    }
    // prévia do ordenante para o formulário (a escolha PF/PJ mostra estes dados, somente leitura)
    return json(res, 200, { solicitacoes: sols, ordenantes: { pf: mascarar(ordenanteDoPerfil('pf', perfil)), pj: ordenanteDoPerfil('pj', perfil) } });
  }
  async function criar(req, res, u) {
    const b = await corpo(req);
    const { out, invalidos } = lerCampos({ instrumento: 'SBLC', moeda: 'USD', ...b });
    if (invalidos.length) return json(res, 400, { erro: 'campos_invalidos', campos: invalidos });
    const r = await db.transacao(async (q) => {
      await q('select pg_advisory_xact_lock(hashtextextended($1, 0))', ['instrumento:' + u.id]);
      const c = (await q(`select count(*) filter (where status not in ('recusada','cancelada','concluida'))::int as abertas,
                                 count(*) filter (where criado_em > now() - interval '24 hours')::int as dia
                            from instrumentos_solicitacoes where usuario_id=$1`, [u.id])).rows[0];
      if (c.abertas >= ABERTAS_MAX || c.dia >= CRIADAS_DIA_MAX) return null;
      const s = (await q(`insert into instrumentos_solicitacoes(usuario_id, instrumento, categoria, moeda, valor_centavos, beneficiario, ordenante, finalidade,
                            banco_emissor, banco_avisador, validade, operacao_subjacente, contrato_ref, observacoes, atualizado_por)
                          values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15) returning id, status`,
        [u.id, out.instrumento, GARANTIAS[out.instrumento] ? 'garantia' : 'declaracao', out.moeda, out.valor_centavos ?? null, JSON.stringify(out.beneficiario || {}),
          JSON.stringify(out.ordenante || {}), out.finalidade ?? null, out.banco_emissor ?? null, out.banco_avisador ?? null, out.validade ?? null,
          out.operacao_subjacente ?? null, out.contrato_ref ?? null, out.observacoes ?? null, u.email])).rows[0];
      await evento(q, s.id, { tipo: 'status', para: 'rascunho', texto: null, visivel: true, por: u.email, equipe: false });
      return s;
    });
    if (!r) return json(res, 429, { erro: 'limite_instrumentos' });
    return json(res, 201, { solicitacao: r });
  }
  /** Trava a solicitação DA PRÓPRIA cliente (outra cliente → 404, sem revelar a existência). */
  const minha = async (q, u, id) => {
    if (!UUID.test(id)) throw erroHttp(404, 'nao_encontrado');
    const s = (await q(`select ${COLS} from instrumentos_solicitacoes s where s.id=$1 and s.usuario_id=$2 for update`, [id, u.id])).rows[0];
    if (!s) throw erroHttp(404, 'nao_encontrado');
    return s;
  };
  async function editar(req, res, u, id) {
    const b = await corpo(req);
    const { out, invalidos } = lerCampos(b);
    if (invalidos.length) return json(res, 400, { erro: 'campos_invalidos', campos: invalidos });
    try {
      await db.transacao(async (q) => {
        const s = await minha(q, u, id);
        if (!EDITAVEL_CLIENTE.includes(s.status)) throw erroHttp(409, 'nao_editavel');
        // depois de enviada, o tipo de instrumento não muda (a referência já foi gerada com ele)
        if (s.status !== 'rascunho' && out.instrumento && out.instrumento !== s.instrumento) throw erroHttp(409, 'instrumento_fixo');
        const sets = []; const vals = [id];
        for (const [k, v] of Object.entries(out)) {
          vals.push(k === 'beneficiario' || k === 'ordenante' ? JSON.stringify(v) : v);
          sets.push(`${k}=$${vals.length}${k === 'beneficiario' || k === 'ordenante' ? '::jsonb' : ''}`);
        }
        if (out.instrumento) { vals.push(GARANTIAS[out.instrumento] ? 'garantia' : 'declaracao'); sets.push(`categoria=$${vals.length}`); }
        vals.push(u.email); sets.push(`atualizado_em=now(), atualizado_por=$${vals.length}`);
        await q(`update instrumentos_solicitacoes set ${sets.join(', ')} where id=$1`, vals);
        // já enviada: a alteração não pode deixar a solicitação incompleta (desfaz tudo)
        if (s.status === 'enviada') {
          const nova = (await q(`select ${COLS} from instrumentos_solicitacoes s where s.id=$1`, [id])).rows[0];
          const f = faltando(nova, await perfilDe(q, u.id));
          if (f.length) throw erroHttp(400, 'campos_obrigatorios', { campos: f });
        }
      });
    } catch (e) { return responder(res, e); }
    return json(res, 200, { ok: true });
  }
  /** Rascunho → enviada (gera a referência) · Documentação solicitada → em análise documental (reenvio). */
  async function enviar(req, res, u, id) {
    let r;
    try {
      r = await db.transacao(async (q) => {
        const s = await minha(q, u, id);
        if (!EDITAVEL_CLIENTE.includes(s.status)) throw erroHttp(409, 'ja_enviada');
        const perfil = await perfilDe(q, u.id);
        const f = faltando(s, perfil);
        if (f.length) throw erroHttp(400, 'campos_obrigatorios', { campos: f });
        // retrato do ordenante no momento do envio, montado AQUI a partir do perfil (nunca do que o navegador mandou)
        if (s.ordenante?.tipo === 'pf' || s.ordenante?.tipo === 'pj') {
          s.ordenante = ordenanteDoPerfil(s.ordenante.tipo, perfil);
          await q('update instrumentos_solicitacoes set ordenante=$2::jsonb where id=$1', [id, JSON.stringify(s.ordenante)]);
        }
        const para = s.status === 'documentacao_solicitada' ? 'analise_documental' : 'enviada';
        let ref = s.referencia;
        if (!ref) {
          const n = (await q(`select nextval('instrumentos_ref_seq')::int as n`)).rows[0].n;
          ref = `CTB-${s.instrumento}-${new Date().getUTCFullYear()}-${String(n).padStart(5, '0')}`;
        }
        await q(`update instrumentos_solicitacoes set status=$2, referencia=$3, enviado_em=coalesce(enviado_em, now()), atualizado_em=now(), atualizado_por=$4 where id=$1`, [id, para, ref, u.email]);
        await evento(q, id, { tipo: 'status', de: s.status, para, texto: s.status === 'enviada' ? 'Solicitação alterada pelo cliente.' : null, visivel: true, por: u.email, equipe: false });
        return { ...s, status: para, referencia: ref, primeiroEnvio: s.status === 'rascunho', alterada: s.status === 'enviada' };
      });
    } catch (e) { return responder(res, e); }
    if (avisarEquipe) {
      setImmediate(async () => {
        try {
          const n = (await db.q(`select dados->>'display_name' as nome from perfis where usuario_id=$1`, [u.id])).rows[0];
          const v = r.valor ? `${(BigInt(r.valor) / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(BigInt(r.valor) % 100n).toString().padStart(2, '0')}` : '—';
          await avisarEquipe({ email: u.email, nome: (n && n.nome) || '', referencia: r.referencia, instrumento: `${r.instrumento} — ${GARANTIAS[r.instrumento] || DECLARACOES[r.instrumento]}`,
            valor: `${r.moeda} ${v}`, beneficiario: r.beneficiario?.nome || '—', pais: r.beneficiario?.pais || '—', finalidade: r.finalidade || '—', reenvio: !r.primeiroEnvio && !r.alterada, alterada: r.alterada });
        } catch (e) { log.error('[area-cliente] aviso de instrumento à equipe:', e.message); }
      });
    }
    return json(res, 200, { status: r.status, referencia: r.referencia });
  }
  async function cancelar(req, res, u, id) {
    const b = await corpo(req, 3000);
    try {
      await db.transacao(async (q) => {
        const s = await minha(q, u, id);
        // a cliente pode desistir até a aprovação pela instituição
        if (FINAIS.includes(s.status) || s.status === 'aprovada') throw erroHttp(409, 'nao_cancelavel');
        await q(`update instrumentos_solicitacoes set status='cancelada', atualizado_em=now(), atualizado_por=$2 where id=$1`, [id, u.email]);
        await evento(q, id, { tipo: 'status', de: s.status, para: 'cancelada', texto: txt(b.motivo, 500) || 'Cancelada pela cliente.', visivel: true, por: u.email, equipe: false });
      });
    } catch (e) { return responder(res, e); }
    return json(res, 200, { status: 'cancelada' });
  }
  async function mensagemCliente(req, res, u, id) {
    const b = await corpo(req, 6000);
    const texto = txt(b.texto, 2000);
    if (!texto) return json(res, 400, { erro: 'texto_obrigatorio' });
    try {
      await db.transacao(async (q) => {
        const s = await minha(q, u, id);
        if (s.status === 'rascunho' || FINAIS.includes(s.status)) throw erroHttp(409, 'nao_aceita_mensagem');
        const n = (await q(`select count(*)::int n from instrumentos_eventos e join instrumentos_solicitacoes s on s.id=e.solicitacao_id
                              where s.usuario_id=$1 and e.tipo='mensagem' and not e.por_equipe and e.em > now() - interval '24 hours'`, [u.id])).rows[0].n;
        if (n >= MENSAGENS_DIA_MAX) throw erroHttp(429, 'limite_mensagens');
        await evento(q, id, { tipo: 'mensagem', texto, visivel: true, por: u.email, equipe: false });
        await q('update instrumentos_solicitacoes set atualizado_em=now() where id=$1', [id]);
      });
    } catch (e) { return responder(res, e); }
    return json(res, 201, { ok: true });
  }
  const TIPOS_ANEXO = ['contrato_referencia'];
  async function anexoCliente(req, res, u, id) {
    // confere antes de receber (e de novo dentro da transação que grava o vínculo)
    if (!UUID.test(id)) return json(res, 404, { erro: 'nao_encontrado' });
    const tipoAnexo = new URL(req.url, 'http://x').searchParams.get('tipo') || null;
    if (tipoAnexo && !TIPOS_ANEXO.includes(tipoAnexo)) return json(res, 400, { erro: 'tipo_anexo_invalido' });
    const s = (await db.q('select status from instrumentos_solicitacoes where id=$1 and usuario_id=$2', [id, u.id])).rows[0];
    if (!s) return json(res, 404, { erro: 'nao_encontrado' });
    if (FINAIS.includes(s.status)) return json(res, 409, { erro: 'nao_aceita_anexo' });
    return receberArquivo(req, res, u, {
      dono: u.id, origem: 'instrumento',
      vincular: async (q, doc) => {
        const t = (await q('select status from instrumentos_solicitacoes where id=$1 and usuario_id=$2 for update', [id, u.id])).rows[0];
        if (!t || FINAIS.includes(t.status)) throw erroHttp(409, 'nao_aceita_anexo');
        await q('insert into instrumentos_anexos(solicitacao_id, documento_id, por_equipe, tipo) values ($1,$2,false,$3)', [id, doc.id, tipoAnexo]);
        await evento(q, id, { tipo: 'anexo', texto: (tipoAnexo === 'contrato_referencia' ? 'Contrato de referência: ' : '') + doc.nome, documento: doc.id, visivel: true, por: u.email, equipe: false });
      },
    });
  }
  /** A cliente retira um anexo PRÓPRIO enquanto pode editar (rascunho / documentação solicitada). */
  async function removerAnexoCliente(res, u, id, docId) {
    if (!UUID.test(docId)) return json(res, 404, { erro: 'nao_encontrado' });
    try {
      await db.transacao(async (q) => {
        const s = await minha(q, u, id);
        if (!EDITAVEL_CLIENTE.includes(s.status)) throw erroHttp(409, 'nao_editavel');
        const a = (await q(`delete from instrumentos_anexos a using documentos d where a.solicitacao_id=$1 and a.documento_id=$2 and not a.por_equipe and d.id=a.documento_id
                            returning d.nome`, [id, docId])).rows[0];
        if (!a) throw erroHttp(404, 'nao_encontrado');
        await evento(q, id, { tipo: 'anexo', texto: 'Anexo removido: ' + a.nome, visivel: true, por: u.email, equipe: false });
      });
    } catch (e) { return responder(res, e); }
    return json(res, 200, { ok: true });
  }
  async function cliente(req, res, rota, u) {
    const m = req.method;
    const p = rota.slice('/api/cliente/instrumentos'.length).split('/').filter(Boolean);
    if (p.length === 0 && m === 'GET') return listarDoCliente(res, u);
    if (p.length === 0 && m === 'POST') return criar(req, res, u);
    if (p.length === 1 && m === 'PUT') return editar(req, res, u, p[0]);
    if (p.length === 2 && m === 'POST' && p[1] === 'enviar') return enviar(req, res, u, p[0]);
    if (p.length === 2 && m === 'POST' && p[1] === 'cancelar') return cancelar(req, res, u, p[0]);
    if (p.length === 2 && m === 'POST' && p[1] === 'mensagens') return mensagemCliente(req, res, u, p[0]);
    if (p.length === 2 && m === 'POST' && p[1] === 'anexos') return anexoCliente(req, res, u, p[0]);
    if (p.length === 3 && m === 'DELETE' && p[1] === 'anexos') return removerAnexoCliente(res, u, p[0], p[2]);
    return json(res, 404, { erro: 'rota' });
  }

  // ============================================================== EQUIPE
  const FILTROS = {
    abertas: `s.status not in ('rascunho','recusada','cancelada','concluida')`,
    finalizadas: `s.status in ('recusada','cancelada','concluida')`,
    todas: `s.status <> 'rascunho'`,
  };
  async function listarEquipe(res, url) {
    const st = url.searchParams.get('status') || 'abertas';
    const where = [FILTROS[st] || (STATUS_INSTRUMENTO.includes(st) && st !== 'rascunho' ? `s.status='${st}'` : FILTROS.abertas)];
    const vals = [];
    const inst = url.searchParams.get('instrumento');
    if (inst && (GARANTIAS[inst] || DECLARACOES[inst])) { vals.push(inst); where.push(`s.instrumento=$${vals.length}`); }
    const moeda = url.searchParams.get('moeda');
    if (moeda && MOEDAS_INSTRUMENTO.includes(moeda)) { vals.push(moeda); where.push(`s.moeda=$${vals.length}`); }
    const uid = url.searchParams.get('usuario');   // ficha do cliente: só as dele
    if (uid && UUID.test(uid)) { vals.push(uid); where.push(`s.usuario_id=$${vals.length}`); }
    const busca = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
    if (busca) { vals.push(busca); where.push(`(u.email like '%' || $${vals.length} || '%' or lower(coalesce(p.dados->>'display_name','')) like '%' || $${vals.length} || '%' or lower(coalesce(s.referencia,'')) like '%' || $${vals.length} || '%')`); }
    const r = await db.q(`select ${COLS}, s.usuario_id, s.responsavel_email, s.instituicao, u.email, p.dados->>'display_name' as nome
                            from instrumentos_solicitacoes s join usuarios u on u.id=s.usuario_id left join perfis p on p.usuario_id=u.id
                           where ${where.join(' and ')} order by s.atualizado_em desc limit 300`, vals);
    return json(res, 200, { solicitacoes: r.rows });
  }
  const daEquipe = async (q, id, travar = false) => {
    if (!UUID.test(id)) throw erroHttp(404, 'nao_encontrado');
    const s = (await q(`select ${COLS}, s.usuario_id, s.responsavel_email, s.instituicao, u.email from instrumentos_solicitacoes s join usuarios u on u.id=s.usuario_id
                         where s.id=$1 and s.status <> 'rascunho' ${travar ? 'for update of s' : ''}`, [id])).rows[0];
    if (!s) throw erroHttp(404, 'nao_encontrado');
    return s;
  };
  const podeAprovar = async (u) => (await db.q('select aprova_instrumentos from equipe where usuario_id=$1 and ativo', [u.id])).rows[0]?.aprova_instrumentos === true;
  async function fichaEquipe(res, u, id, registrar) {
    let s;
    try { s = await daEquipe(db.q, id); } catch (e) { return responder(res, e); }
    s.nome = (await db.q(`select dados->>'display_name' as n from perfis where usuario_id=$1`, [s.usuario_id])).rows[0]?.n || null;
    s.eventos = (await db.q('select id, tipo, status_de, status_para, texto, visivel_cliente, documento_id, por_email, por_equipe, em from instrumentos_eventos where solicitacao_id=$1 order by em, id', [id])).rows;
    s.anexos = (await db.q(`select d.id, d.nome, d.tipo, d.tamanho, a.por_equipe, a.evidencia_de, a.tipo as tipo_anexo, a.em from instrumentos_anexos a join documentos d on d.id=a.documento_id
                             where a.solicitacao_id=$1 order by a.em`, [id])).rows;
    s.transicoes = TRANSICOES[s.status] || [];
    s.podeAprovar = await podeAprovar(u);
    s.equipe = (await db.q('select u.email from equipe e join usuarios u on u.id=e.usuario_id where e.ativo order by u.email')).rows.map((x) => x.email);
    await registrar(u, 'ver_instrumento', s.referencia || id);
    return json(res, 200, s);
  }
  async function statusEquipe(req, res, u, id, registrar) {
    const b = await corpo(req, 4000);
    const para = b.status; const texto = txt(b.texto, 2000);
    if (!STATUS_INSTRUMENTO.includes(para) || para === 'rascunho') return json(res, 400, { erro: 'status_invalido', mensagem: 'Situação inválida.' });
    if (['recusada', 'cancelada'].includes(para) && !texto) return json(res, 400, { erro: 'motivo_obrigatorio', mensagem: 'Escreva o motivo para o cliente.' });
    if (para === 'documentacao_solicitada' && !texto) return json(res, 400, { erro: 'texto_obrigatorio', mensagem: 'Descreva quais documentos o cliente deve enviar.' });
    // aprovação/conclusão: só quem tem a permissão específica (hoje, somente a titular)
    if (['aprovada', 'concluida'].includes(para) && !(await podeAprovar(u))) return json(res, 403, { erro: 'sem_permissao', mensagem: 'Somente usuários autorizados podem marcar como aprovada ou concluída.' });
    let r;
    try {
      r = await db.transacao(async (q) => {
        const s = await daEquipe(q, id, true);
        if (!(TRANSICOES[s.status] || []).includes(para)) throw erroHttp(409, 'transicao_invalida', { mensagem: `Não é possível passar de "${STATUS_PT[s.status]}" para "${STATUS_PT[para]}".` });
        if (['aprovada', 'concluida'].includes(para)) {
          const ev = (await q('select count(*)::int n from instrumentos_anexos where solicitacao_id=$1 and por_equipe and evidencia_de=$2', [id, para])).rows[0].n;
          if (!ev) throw erroHttp(409, 'sem_evidencia', { mensagem: `Anexe o comprovante da instituição (evidência de "${STATUS_PT[para]}") antes de mudar a situação.` });
        }
        await q('update instrumentos_solicitacoes set status=$2, atualizado_em=now(), atualizado_por=$3 where id=$1', [id, para, u.email]);
        await evento(q, id, { tipo: para === 'documentacao_solicitada' ? 'pedido_documento' : 'status', de: s.status, para, texto: texto || null, visivel: true, por: u.email, equipe: true });
        return s;
      });
    } catch (e) { if (e.status) return json(res, e.status, { erro: e.message, ...e.extra }); throw e; }
    await registrar(u, 'instrumento_' + para, r.referencia || id);
    // gatilhos (ex.: aprovada → contrato NDA em rascunho para a equipe revisar)
    if (aoStatus) { try { await aoStatus(para, r, u); } catch (e) { log.error('[area-cliente] gatilho de status', para, e.message); } }
    return json(res, 200, { status: para });
  }
  async function mensagemEquipe(req, res, u, id, registrar) {
    const b = await corpo(req, 6000);
    const texto = txt(b.texto, 2000); const interna = b.interna === true;
    if (!texto) return json(res, 400, { erro: 'texto_obrigatorio', mensagem: 'Escreva a mensagem.' });
    let s;
    try {
      s = await db.transacao(async (q) => {
        const x = await daEquipe(q, id, true);
        await evento(q, id, { tipo: interna ? 'nota_interna' : 'mensagem', texto, visivel: !interna, por: u.email, equipe: true });
        await q('update instrumentos_solicitacoes set atualizado_em=now(), atualizado_por=$2 where id=$1', [id, u.email]);
        return x;
      });
    } catch (e) { return responder(res, e); }
    await registrar(u, interna ? 'instrumento_nota_interna' : 'instrumento_mensagem', s.referencia || id);
    return json(res, 201, { ok: true });
  }
  async function responsavel(req, res, u, id, registrar) {
    const b = await corpo(req, 2000);
    const email = String(b.email || '').trim().toLowerCase();
    if (email && !(await db.q('select 1 from equipe e join usuarios u on u.id=e.usuario_id where e.ativo and u.email=$1', [email])).rowCount) return json(res, 400, { erro: 'nao_e_equipe', mensagem: 'Escolha alguém da equipe.' });
    let s;
    try {
      s = await db.transacao(async (q) => {
        const x = await daEquipe(q, id, true);
        await q('update instrumentos_solicitacoes set responsavel_email=$2, atualizado_em=now(), atualizado_por=$3 where id=$1', [id, email || null, u.email]);
        await evento(q, id, { tipo: 'nota_interna', texto: email ? `Responsável: ${email}` : 'Responsável removido', visivel: false, por: u.email, equipe: true });
        return x;
      });
    } catch (e) { return responder(res, e); }
    await registrar(u, 'instrumento_responsavel', s.referencia || id, { responsavel: email || null });
    return json(res, 200, { ok: true });
  }
  async function instituicao(req, res, u, id, registrar) {
    const b = await corpo(req, 2000);
    const nome = txt(b.instituicao, 160);
    let s;
    try {
      s = await db.transacao(async (q) => {
        const x = await daEquipe(q, id, true);
        await q('update instrumentos_solicitacoes set instituicao=$2, atualizado_em=now(), atualizado_por=$3 where id=$1', [id, nome || null, u.email]);
        await evento(q, id, { tipo: 'nota_interna', texto: nome ? `Instituição financeira: ${nome}` : 'Instituição removida', visivel: false, por: u.email, equipe: true });
        return x;
      });
    } catch (e) { return responder(res, e); }
    await registrar(u, 'instrumento_instituicao', s.referencia || id, { instituicao: nome || null });
    return json(res, 200, { ok: true });
  }
  /** Comprovante enviado pela EQUIPE (evidência para "aprovada"/"concluída" ou documento interno). Cliente não vê nem baixa. */
  async function evidencia(req, res, u, id, url, registrar) {
    const de = url.searchParams.get('para');
    if (de && !['aprovada', 'concluida'].includes(de)) return json(res, 400, { erro: 'evidencia_invalida' });
    let s;
    try { s = await daEquipe(db.q, id); } catch (e) { return responder(res, e); }
    if (FINAIS.includes(s.status)) return json(res, 409, { erro: 'finalizada', mensagem: 'Solicitação finalizada.' });
    const ok = await receberArquivo(req, res, u, {
      dono: s.usuario_id, origem: 'instrumento_equipe',
      vincular: async (q, doc) => {
        await q('insert into instrumentos_anexos(solicitacao_id, documento_id, por_equipe, evidencia_de) values ($1,$2,true,$3)', [id, doc.id, de || null]);
        await evento(q, id, { tipo: 'anexo', texto: `${de ? `Comprovante (${STATUS_PT[de]}): ` : 'Documento interno: '}${doc.nome}`, documento: doc.id, visivel: false, por: u.email, equipe: true });
      },
    });
    if (res.statusCode === 201) await registrar(u, 'instrumento_evidencia', s.referencia || id, { para: de || null });
    return ok;
  }
  async function equipe(req, res, url, u, p, registrar) {
    const m = req.method;
    if (p.length === 1 && m === 'GET') return listarEquipe(res, url);
    if (p.length === 2 && m === 'GET') return fichaEquipe(res, u, p[1], registrar);
    if (p.length === 3 && m === 'POST') {
      if (p[2] === 'status') return statusEquipe(req, res, u, p[1], registrar);
      if (p[2] === 'mensagem') return mensagemEquipe(req, res, u, p[1], registrar);
      if (p[2] === 'responsavel') return responsavel(req, res, u, p[1], registrar);
      if (p[2] === 'instituicao') return instituicao(req, res, u, p[1], registrar);
      if (p[2] === 'evidencias') return evidencia(req, res, u, p[1], url, registrar);
    }
    return json(res, 404, { erro: 'rota' });
  }
  const abertas = async () => (await db.q(`select count(*)::int n from instrumentos_solicitacoes where status not in ('rascunho','recusada','cancelada','concluida')`)).rows[0].n;
  return { cliente, equipe, abertas };
}
