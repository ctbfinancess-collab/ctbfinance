/**
 * Contratos automáticos no papel timbrado (NDA e, no futuro, outros modelos de modelos-contrato.mjs).
 *
 * - A equipe gera um contrato para um cliente (ou o sistema gera sozinho num evento, ex.: solicitação aprovada);
 *   os campos vêm preenchidos do cadastro ("Meu perfil"), da solicitação e da configuração de assinatura.
 * - Tudo é editável pela equipe (campos e, se preciso, o texto inteiro). Cada gravação vira uma nova versão.
 * - O cliente só vê/baixa depois de "liberado"; pode enviar a via assinada (vai para a ficha, não para Documentos).
 *
 * Cliente:  /api/cliente/contratos[...]          Equipe: /api/cliente/equipe/contratos[...] (via painel.mjs)
 */
import { MODELOS, AUTOMATICOS } from './modelos-contrato.mjs';
import { gerarPdf } from './pdf-contrato.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const txt = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');
const VAZIO = '____________________';
const hojeDubai = () => { const d = new Date(Date.now() + 4 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const erroHttp = (status, codigo, extra = {}) => Object.assign(new Error(codigo), { status, extra });

/** Só as chaves do modelo, texto limpo e curto. */
function limparCampos(modelo, b) {
  const out = {};
  for (const { k } of MODELOS[modelo].campos) out[k] = txt(b?.[k], 300);
  return out;
}
const faltando = (modelo, campos) => MODELOS[modelo].campos.filter(({ k }) => !campos[k]).map(({ k }) => k);
/** Texto do modelo com os campos (vazios viram uma linha para preencher à mão). */
const textoDoModelo = (modelo, campos) => {
  const c = {}; for (const { k } of MODELOS[modelo].campos) c[k] = campos[k] || VAZIO;
  return MODELOS[modelo].texto(c);
};
const assinaturasDe = (modelo, campos) => {
  const c = {}; for (const { k } of MODELOS[modelo].campos) c[k] = campos[k] || VAZIO;
  return MODELOS[modelo].assinaturas(c);
};

/** Países digitados em português no perfil → inglês (os contratos são em inglês). Outros ficam como vieram. */
const PAISES_EN = { 'emirados árabes unidos': 'United Arab Emirates', 'emirados arabes unidos': 'United Arab Emirates', 'emirados': 'United Arab Emirates', 'eau': 'United Arab Emirates', 'estados unidos': 'United States of America', 'eua': 'United States of America', 'reino unido': 'United Kingdom', 'inglaterra': 'United Kingdom', 'alemanha': 'Germany', 'frança': 'France', 'franca': 'France', 'espanha': 'Spain', 'itália': 'Italy', 'italia': 'Italy', 'suíça': 'Switzerland', 'suica': 'Switzerland', 'holanda': 'Netherlands', 'países baixos': 'Netherlands', 'arábia saudita': 'Saudi Arabia', 'arabia saudita': 'Saudi Arabia', 'catar': 'Qatar', 'singapura': 'Singapore', 'japão': 'Japan', 'japao': 'Japan', 'méxico': 'Mexico', 'mexico': 'Mexico', 'canadá': 'Canada', 'argentina': 'Argentina', 'portugal': 'Portugal', 'china': 'China', 'índia': 'India', 'india': 'India', 'turquia': 'Turkey', 'egito': 'Egypt', 'paraguai': 'Paraguay', 'uruguai': 'Uruguay', 'chile': 'Chile', 'colômbia': 'Colombia', 'colombia': 'Colombia', 'peru': 'Peru', 'angola': 'Angola', 'moçambique': 'Mozambique' };
export const paisEn = (v) => PAISES_EN[String(v || '').trim().toLowerCase()] || String(v || '').trim();

/** Número da conta do cliente nos contratos: fixo por cliente (derivado do id), 12 dígitos com prefixo CTB. */
export const numeroConta = (usuarioId) => { const h = String(usuarioId).replace(/[^0-9a-f]/gi, '').slice(0, 12); return 'CTB' + (BigInt('0x' + (h || '0')) % 1000000000000n).toString().padStart(12, '0'); };

export function criarContratos({ db, json, lerJson, receberArquivo, log = console }) {
  const corpo = async (req, max = 60000) => { const b = await lerJson(req, max); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; };
  const responder = (res, e) => { if (e.status) return json(res, e.status, { erro: e.message, ...e.extra }); throw e; };

  /** Preenchimento automático: cadastro do cliente + solicitação (se houver) + quem assina pela CTB. */
  async function preencher(usuarioId, modelo, solicitacaoId = null) {
    const p = (await db.q('select dados from perfis where usuario_id=$1', [usuarioId])).rows[0]?.dados || {};
    const s = solicitacaoId ? (await db.q('select ordenante, beneficiario from instrumentos_solicitacoes where id=$1 and usuario_id=$2', [solicitacaoId, usuarioId])).rows[0] : null;
    const cfg = (await db.q(`select valor from configuracoes where chave='assinatura_ctb'`)).rows[0]?.valor || {};
    const s_ = (v) => (typeof v === 'string' ? v.trim() : '');
    const pais = paisEn(s_(p.companycountry));   // contratos são em inglês
    const endereco = [[s_(p.companysadress), s_(p.companyaddressnumber)].filter(Boolean).join(', '), s_(p.companycity), s_(p.companyzipcode), pais].filter(Boolean).join(', ');
    const o = s?.ordenante || {};
    const representante = s_(p.display_name) || s_(o.tipo === 'pj' ? o.representante : o.nome);
    const auto = {
      data: hojeDubai(),
      empresa: s_(p.CompanyName) || s_(o.nome) || s_(p.display_name),
      jurisdicao: !pais || /^(brasil|brazil)$/i.test(pais) ? 'the Federative Republic of Brazil' : /^(United Arab Emirates|United States of America|United Kingdom|Netherlands)$/.test(pais) ? 'the ' + pais : pais,
      registro: s_(p.Companyregistrationnumber),
      endereco,
      representante,
      passaporte: s_(p.passportnumber) || (o.tipo === 'pf' ? s_(o.passaporte) : (!o.tipo && s_(o.nome) === representante ? s_(o.identificacao) : '')),
      cargoRep: s_(p.companyposition) || (o.tipo === 'pj' ? s_(o.cargo) : ''),
      ctbNome: s_(cfg.nome), ctbCargo: s_(cfg.cargo), ctbPin: s_(cfg.pin),
      nacionalidade: s_(p.nationality), telefone: s_(p.phone_number),
      conta: numeroConta(usuarioId),
    };
    const out = {};
    for (const { k, padrao } of MODELOS[modelo].campos) out[k] = txt(auto[k] || padrao || '', 300);
    return out;
  }

  /** Cria um contrato (rascunho) já preenchido. `q` = conexão da transação. */
  async function criar(q, { usuarioId, modelo, solicitacaoId = null, por, automatico = false, campos = null }) {
    const c = campos || await preencher(usuarioId, modelo, solicitacaoId);
    const ano = new Date(Date.now() + 4 * 3600e3).getUTCFullYear();
    const n = (await q(`select nextval('contratos_ref_seq')::int as n`)).rows[0].n;
    const ref = `CTB-${MODELOS[modelo].rotulo}-${ano}-${String(n).padStart(5, '0')}`;
    const r = (await q(`insert into contratos(usuario_id, solicitacao_id, referencia, modelo, campos, gerado_por, automatico, atualizado_por)
                        values ($1,$2,$3,$4,$5::jsonb,$6,$7,$6) on conflict do nothing returning id, referencia`,
      [usuarioId, solicitacaoId, ref, modelo, JSON.stringify(c), por, automatico])).rows[0];
    if (r) await q('insert into contratos_versoes(contrato_id, versao, campos, por_email) values ($1,1,$2::jsonb,$3)', [r.id, JSON.stringify(c), por]);
    return r || null;
  }

  /** Gatilhos automáticos (ver AUTOMATICOS): cria o rascunho para a equipe revisar. Nunca libera sozinho. */
  async function aoEvento(evento, { usuarioId, solicitacaoId = null, por }) {
    for (const modelo of AUTOMATICOS[evento] || []) {
      try {
        // modelos "um por cliente" (ex.: abertura de conta): não cria de novo se já existe um não cancelado
        if (MODELOS[modelo]?.umPorCliente && (await db.q(`select 1 from contratos where usuario_id=$1 and modelo=$2 and status <> 'cancelado' limit 1`, [usuarioId, modelo])).rowCount) continue;
        const r = await db.transacao((q) => criar(q, { usuarioId, modelo, solicitacaoId, por, automatico: true }));
        if (r) await db.q('insert into acoes_equipe(por_email, acao, alvo, detalhes) values ($1,$2,$3,$4::jsonb)', [por, 'contrato_automatico', r.referencia, JSON.stringify({ evento, modelo })]);
      } catch (e) { log.error('[area-cliente] contrato automático', evento, modelo, e.message); }
    }
  }

  const doContrato = async (q, id, { usuarioId = null, travar = false } = {}) => {
    if (!UUID.test(id)) throw erroHttp(404, 'nao_encontrado');
    const c = (await q(`select c.*, u.email from contratos c join usuarios u on u.id=c.usuario_id where c.id=$1 ${usuarioId ? 'and c.usuario_id=$2' : ''} ${travar ? 'for update of c' : ''}`,
      usuarioId ? [id, usuarioId] : [id])).rows[0];
    if (!c || !MODELOS[c.modelo]) throw erroHttp(404, 'nao_encontrado');
    return c;
  };
  const textoAtual = (c) => c.texto_editado || textoDoModelo(c.modelo, c.campos);

  async function enviarPdf(res, c, u, papel, baixar) {
    const m = MODELOS[c.modelo];
    const pdf = await gerarPdf({ rotulo: m.rotulo, titulo: m.titulo, referencia: c.referencia, rascunho: c.status === 'rascunho', texto: textoAtual(c), assinaturas: assinaturasDe(c.modelo, c.campos) });
    await db.q('insert into contratos_acessos(contrato_id, usuario_id, papel) values ($1,$2,$3)', [c.id, u.id, papel]);
    res.writeHead(200, {
      'Content-Type': 'application/pdf', 'Content-Length': pdf.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${baixar ? 'attachment' : 'inline'}; filename="${c.referencia}.pdf"`,
    });
    res.end(Buffer.from(pdf));
  }

  // ============================================================== CLIENTE
  const publico = (c) => ({ id: c.id, referencia: c.referencia, modelo: c.modelo, titulo: MODELOS[c.modelo]?.titulo || c.modelo, status: c.status,
    liberadoEm: c.liberado_em, assinadoEm: c.assinado_em, assinadoEnviado: !!c.assinado_documento_id });
  async function cliente(req, res, rota, u) {
    const m = req.method;
    const p = rota.slice('/api/cliente/contratos'.length).split('/').filter(Boolean);
    try {
      if (p.length === 0 && m === 'GET') {
        const r = await db.q(`select * from contratos where usuario_id=$1 and status in ('liberado','assinado') order by liberado_em desc`, [u.id]);
        return json(res, 200, { contratos: r.rows.map(publico) });
      }
      if (p.length === 2 && p[1] === 'pdf' && m === 'GET') {
        const c = await doContrato(db.q, p[0], { usuarioId: u.id });
        if (!['liberado', 'assinado'].includes(c.status)) throw erroHttp(404, 'nao_encontrado');   // rascunho: invisível
        return await enviarPdf(res, c, u, 'dono', true);
      }
      if (p.length === 2 && p[1] === 'assinado' && m === 'POST') {
        const c = await doContrato(db.q, p[0], { usuarioId: u.id });
        if (c.status !== 'liberado') throw erroHttp(c.status === 'assinado' ? 409 : 404, c.status === 'assinado' ? 'ja_assinado' : 'nao_encontrado');
        return receberArquivo(req, res, u, {
          dono: u.id, origem: 'contrato',
          vincular: async (q, doc) => {
            const t = (await q('select status from contratos where id=$1 and usuario_id=$2 for update', [c.id, u.id])).rows[0];
            if (!t || t.status !== 'liberado') throw erroHttp(409, 'ja_assinado');
            await q(`update contratos set status='assinado', assinado_documento_id=$2, assinado_em=now(), atualizado_em=now(), atualizado_por=$3 where id=$1`, [c.id, doc.id, u.email]);
          },
        });
      }
    } catch (e) { return responder(res, e); }
    return json(res, 404, { erro: 'rota' });
  }

  // ============================================================== EQUIPE
  async function ficha(c) {
    const versoes = (await db.q('select versao, por_email, em from contratos_versoes where contrato_id=$1 order by versao desc', [c.id])).rows;
    const nome = (await db.q(`select dados->>'display_name' n from perfis where usuario_id=$1`, [c.usuario_id])).rows[0]?.n || null;
    return {
      id: c.id, referencia: c.referencia, modelo: c.modelo, titulo: MODELOS[c.modelo].titulo, status: c.status, versao: c.versao,
      usuarioId: c.usuario_id, email: c.email, nome, solicitacaoId: c.solicitacao_id, automatico: c.automatico,
      campos: c.campos, texto: textoAtual(c), textoEditado: !!c.texto_editado, faltando: faltando(c.modelo, c.campos),
      geradoPor: c.gerado_por, criadoEm: c.criado_em, liberadoEm: c.liberado_em, liberadoPor: c.liberado_por,
      assinadoEm: c.assinado_em, assinadoDocumentoId: c.assinado_documento_id, versoes,
    };
  }
  async function equipe(req, res, url, u, p, registrar) {
    const m = req.method;
    try {
      if (p.length === 2 && p[1] === 'modelos' && m === 'GET')
        return json(res, 200, { modelos: Object.entries(MODELOS).map(([id, x]) => ({ id, titulo: x.titulo, rotulo: x.rotulo, campos: x.campos })) });
      if (p.length === 2 && p[1] === 'config') {
        if (m === 'GET') return json(res, 200, { assinatura: (await db.q(`select valor from configuracoes where chave='assinatura_ctb'`)).rows[0]?.valor || {} });
        if (m === 'PUT') {
          const b = await corpo(req, 2000);
          const v = { nome: txt(b.nome, 120), cargo: txt(b.cargo, 80), pin: txt(b.pin, 40) };
          await db.q(`insert into configuracoes(chave, valor, atualizado_por) values ('assinatura_ctb',$1::jsonb,$2)
                      on conflict (chave) do update set valor=excluded.valor, atualizado_por=excluded.atualizado_por, atualizado_em=now()`, [JSON.stringify(v), u.email]);
          await registrar(u, 'contratos_assinatura_ctb', null, v);
          return json(res, 200, { assinatura: v });
        }
      }
      if (p.length === 1 && m === 'GET') {
        const usuario = url.searchParams.get('usuario'); const sol = url.searchParams.get('solicitacao');
        if (usuario && !UUID.test(usuario)) return json(res, 200, { contratos: [] });
        if (sol && !UUID.test(sol)) return json(res, 200, { contratos: [] });
        const where = []; const vals = [];
        if (usuario) { vals.push(usuario); where.push(`c.usuario_id=$${vals.length}`); }
        if (sol) { vals.push(sol); where.push(`c.solicitacao_id=$${vals.length}`); }
        const r = await db.q(`select c.id, c.referencia, c.modelo, c.status, c.versao, c.automatico, c.criado_em, c.liberado_em, c.assinado_em, c.solicitacao_id, u.email
                                from contratos c join usuarios u on u.id=c.usuario_id ${where.length ? 'where ' + where.join(' and ') : ''} order by c.criado_em desc limit 200`, vals);
        return json(res, 200, { contratos: r.rows.map((x) => ({ ...x, titulo: MODELOS[x.modelo]?.titulo || x.modelo })) });
      }
      if (p.length === 1 && m === 'POST') {
        const b = await corpo(req, 2000);
        const modelo = String(b.modelo || ''); const usuarioId = String(b.usuarioId || ''); const sol = b.solicitacaoId ? String(b.solicitacaoId) : null;
        if (!MODELOS[modelo]) return json(res, 400, { erro: 'modelo_invalido', mensagem: 'Modelo de contrato inválido.' });
        if (!UUID.test(usuarioId) || (sol && !UUID.test(sol))) return json(res, 404, { erro: 'nao_encontrado' });
        if (!(await db.q('select 1 from usuarios where id=$1', [usuarioId])).rowCount) return json(res, 404, { erro: 'nao_encontrado' });
        if (sol && !(await db.q('select 1 from instrumentos_solicitacoes where id=$1 and usuario_id=$2', [sol, usuarioId])).rowCount) return json(res, 404, { erro: 'nao_encontrado' });
        const r = await db.transacao((q) => criar(q, { usuarioId, modelo, solicitacaoId: sol, por: u.email }));
        await registrar(u, 'contrato_gerado', r.referencia, { modelo });
        return json(res, 201, await ficha(await doContrato(db.q, r.id)));
      }
      const id = p[1];
      if (p.length === 2 && m === 'GET') return json(res, 200, await ficha(await doContrato(db.q, id)));
      if (p.length === 3 && p[2] === 'pdf' && m === 'GET') {
        const c = await doContrato(db.q, id);
        await registrar(u, 'contrato_pdf', c.referencia);
        return await enviarPdf(res, c, u, 'equipe', url.searchParams.get('baixar') === '1');
      }
      if (p.length === 3 && p[2] === 'preencher' && m === 'GET') {
        const c = await doContrato(db.q, id);
        return json(res, 200, { campos: await preencher(c.usuario_id, c.modelo, c.solicitacao_id) });
      }
      if (p.length === 2 && m === 'PUT') {
        const b = await corpo(req);
        const r = await db.transacao(async (q) => {
          const c = await doContrato(q, id, { travar: true });
          if (!['rascunho', 'liberado'].includes(c.status)) throw erroHttp(409, 'nao_editavel', { mensagem: 'Contrato assinado ou cancelado não pode ser editado.' });
          const campos = limparCampos(c.modelo, b.campos || {});
          // texto livre: só guarda se for diferente do texto gerado pelos campos (senão continua "automático")
          let texto = typeof b.texto === 'string' ? b.texto.replace(/\r/g, '').slice(0, 60000).trim() : null;
          if (texto && texto === textoDoModelo(c.modelo, campos).trim()) texto = null;
          const versao = c.versao + 1;
          // editar um contrato já liberado o devolve a rascunho (o cliente deixa de vê-lo até nova liberação)
          await q(`update contratos set campos=$2::jsonb, texto_editado=$3, versao=$4, status='rascunho', atualizado_em=now(), atualizado_por=$5 where id=$1`,
            [id, JSON.stringify(campos), texto || null, versao, u.email]);
          await q('insert into contratos_versoes(contrato_id, versao, campos, texto_editado, por_email) values ($1,$2,$3::jsonb,$4,$5)', [id, versao, JSON.stringify(campos), texto || null, u.email]);
          return { ref: c.referencia, versao, voltou: c.status === 'liberado' };
        });
        await registrar(u, 'contrato_editado', r.ref, { versao: r.versao, voltouARascunho: r.voltou });
        return json(res, 200, await ficha(await doContrato(db.q, id)));
      }
      if (p.length === 3 && p[2] === 'liberar' && m === 'POST') {
        const ref = await db.transacao(async (q) => {
          const c = await doContrato(q, id, { travar: true });
          if (c.status !== 'rascunho') throw erroHttp(409, 'nao_liberavel', { mensagem: 'Só um rascunho pode ser liberado.' });
          const f = faltando(c.modelo, c.campos);
          if (f.length) throw erroHttp(409, 'campos_faltando', { campos: f, mensagem: 'Preencha todos os campos antes de liberar ao cliente.' });
          await q(`update contratos set status='liberado', liberado_em=now(), liberado_por=$2, atualizado_em=now(), atualizado_por=$2 where id=$1`, [id, u.email]);
          return c.referencia;
        });
        await registrar(u, 'contrato_liberado', ref);
        return json(res, 200, await ficha(await doContrato(db.q, id)));
      }
      if (p.length === 3 && p[2] === 'cancelar' && m === 'POST') {
        const ref = await db.transacao(async (q) => {
          const c = await doContrato(q, id, { travar: true });
          if (c.status === 'cancelado') throw erroHttp(409, 'ja_cancelado');
          await q(`update contratos set status='cancelado', atualizado_em=now(), atualizado_por=$2 where id=$1`, [id, u.email]);
          return c.referencia;
        });
        await registrar(u, 'contrato_cancelado', ref);
        return json(res, 200, await ficha(await doContrato(db.q, id)));
      }
    } catch (e) { return responder(res, e); }
    return json(res, 404, { erro: 'rota' });
  }

  return { cliente, equipe, aoEvento, preencher };
}
