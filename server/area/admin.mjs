/**
 * Operações da equipe CTB (rodam no servidor do Railway ou num computador autorizado com DATABASE_URL).
 * Nunca expostas pela web. Usadas pelo script scripts/ctb-admin.mjs e pelos testes.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { FORMATOS } from './nucleo.mjs';

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const norm = (e) => String(e || '').trim().toLowerCase();

export function criarAdmin({ db, arquivos, api, avisarCliente = null }) {
  const usuarioPorEmail = async (email) => {
    const u = (await db.q('select * from usuarios where email=$1', [norm(email)])).rows[0];
    if (!u) throw new Error(`usuário não encontrado: ${email}`);
    return u;
  };
  const registrar = (u, acao) => db.q('insert into registro_equipe(usuario_id, email, acao) values ($1,$2,$3)', [u.id, u.email, acao]);

  return {
    /** Cria a conta (sem senha) e envia o convite por e-mail; o cliente define a senha pelo link (72 h). */
    async convidar(email, { nome = '', lang = 'pt' } = {}) {
      const e = norm(email);
      if (!EMAIL_RE.test(e)) throw new Error('e-mail inválido');
      const u = (await db.q(`insert into usuarios(email, idioma) values ($1, $2) on conflict (email) do update set idioma=excluded.idioma returning *`, [e, lang === 'en' ? 'en' : 'pt'])).rows[0];
      if (nome) await db.q(`insert into perfis(usuario_id, dados) values ($1, $2::jsonb) on conflict (usuario_id) do update set dados = perfis.dados || excluded.dados`, [u.id, JSON.stringify({ display_name: nome })]);
      await api.enviarLinkSenha(u, u.senha_hash ? 'redefinir' : 'convite', lang);
      return { id: u.id, email: e, convite: u.senha_hash ? 'redefinicao_enviada' : 'convite_enviado' };
    },
    /** Bloqueia o acesso e encerra todas as sessões (vale na hora). */
    async bloquear(email) {
      const u = await usuarioPorEmail(email);
      await db.q('update usuarios set bloqueado=true where id=$1', [u.id]);
      await db.q('update sessoes set revogada_em=now() where usuario_id=$1 and revogada_em is null', [u.id]);
      return { email: u.email, bloqueado: true };
    },
    async desbloquear(email) { const u = await usuarioPorEmail(email); await db.q('update usuarios set bloqueado=false where id=$1', [u.id]); return { email: u.email, bloqueado: false }; },
    /** Equipe grava número/validade do passaporte (já conferidos): o campo fica travado para o cliente. */
    async definirDadosRestritos(email, dados, por = 'equipe') {
      const u = await usuarioPorEmail(email);
      const permitidos = {}; for (const k of ['passportnumber', 'passportexpirationdate']) if (typeof dados[k] === 'string') permitidos[k] = dados[k];
      if (permitidos.passportnumber) permitidos.passportnumber = permitidos.passportnumber.replace(/[\s-]/g, '').toUpperCase();
      await db.q(`insert into perfis(usuario_id, dados, passaporte_conferido_em, passaporte_conferido_por) values ($1, $2::jsonb, now(), $3)
                  on conflict (usuario_id) do update set dados = perfis.dados || excluded.dados, passaporte_conferido_em = now(), passaporte_conferido_por = $3`, [u.id, JSON.stringify(permitidos), por]);
      return { email: u.email, campos: Object.keys(permitidos), conferido: true };
    },
    /** Marca como conferido o passaporte que o próprio cliente informou (trava o campo). */
    async conferirPassaporte(email, por = 'equipe') {
      const u = await usuarioPorEmail(email);
      const r = await db.q(`update perfis set passaporte_conferido_em = now(), passaporte_conferido_por = $2
                             where usuario_id = $1 and coalesce(dados->>'passportnumber', '') <> '' returning dados->>'passportnumber' as numero, dados->>'passportexpirationdate' as validade`, [u.id, por]);
      if (!r.rowCount) throw new Error('o cliente ainda não informou o número do passaporte');
      return { email: u.email, numero: r.rows[0].numero, validade: r.rows[0].validade, conferido: true };
    },
    /** Destrava o passaporte (o cliente volta a poder editar). */
    async liberarPassaporte(email) {
      const u = await usuarioPorEmail(email);
      await db.q('update perfis set passaporte_conferido_em = null, passaporte_conferido_por = null where usuario_id=$1', [u.id]);
      return { email: u.email, conferido: false };
    },
    /** Ficha do cliente para a equipe (inclui o número completo do passaporte, que a web nunca mostra). */
    async verCliente(email) {
      const u = await usuarioPorEmail(email);
      const p = (await db.q('select dados, passaporte_conferido_em, passaporte_conferido_por from perfis where usuario_id=$1', [u.id])).rows[0] || {};
      return { email: u.email, bloqueado: u.bloqueado, senhaDefinida: Boolean(u.senha_hash), dados: p.dados || {}, passaporteConferidoEm: p.passaporte_conferido_em || null, passaporteConferidoPor: p.passaporte_conferido_por || null };
    },

    // ---- equipe (revogação imediata: o cadastro é lido a cada requisição)
    async concederEquipe(email) {
      const u = await usuarioPorEmail(email);
      await db.q(`insert into equipe(usuario_id, ativo, concedido_em) values ($1, true, now()) on conflict (usuario_id) do update set ativo=true, concedido_em=now(), revogado_em=null`, [u.id]);
      await registrar(u, 'concedido');
      return { email: u.email, equipe: true };
    },
    async revogarEquipe(email) {
      const u = await usuarioPorEmail(email);
      await db.q(`update equipe set ativo=false, revogado_em=now() where usuario_id=$1`, [u.id]);
      await registrar(u, 'revogado');
      return { email: u.email, equipe: false };
    },
    async listarEquipe() { return (await db.q('select u.email from equipe e join usuarios u on u.id=e.usuario_id where e.ativo order by u.email')).rows; },

    // ---- documentos
    async listarDocumentos(status) {
      const r = await db.q(`select d.id, u.email, d.nome, d.status, d.recebido_em from documentos d join usuarios u on u.id=d.usuario_id
                             ${status ? 'where d.status=$1' : ''} order by d.recebido_em`, status ? [status] : []);
      return r.rows;
    },
    async baixarDocumento(id, pasta) {
      const d = (await db.q('select * from documentos where id=$1', [id])).rows[0];
      if (!d) throw new Error('documento não encontrado');
      if (!d.chave_arquivo || !['disponivel_analise', 'aprovado', 'rejeitado'].includes(d.status) || (d.status === 'rejeitado' && d.motivo !== 'analise_equipe')) throw new Error(`documento não liberado (${d.status})`);
      // nome definido pelo servidor (id + extensão do tipo); nunca o nome escolhido pelo cliente; não sobrescreve nada
      const destino = path.join(pasta, `${d.id}.${(FORMATOS[d.tipo] || { ext: 'bin' }).ext}`);
      try { await fsp.copyFile(arquivos.caminho(d.chave_arquivo), destino, fs.constants.COPYFILE_EXCL); }
      catch (e) { if (e.code === 'EEXIST') throw new Error(`já existe um arquivo em ${destino}`); throw e; }
      return { salvo: destino, nomeOriginal: d.nome };
    },
    /** Decisão: só sobre "disponivel_analise"; rejeição exige orientação ao cliente; nunca refeita por engano. */
    async decidir(id, decisao, { orientacaoPt, orientacaoEn, por } = {}) {
      if (!['aprovado', 'rejeitado'].includes(decisao)) throw new Error('decisão inválida');
      if (decisao === 'rejeitado' && !orientacaoPt) throw new Error('rejeição exige orientação ao cliente');
      const r = await db.q(`update documentos set status=$2, motivo=$3, orientacao=$4, decidido_por=$5, decidido_em=now()
                              where id=$1 and status='disponivel_analise' returning id, status`,
        [id, decisao, decisao === 'rejeitado' ? 'analise_equipe' : null, decisao === 'rejeitado' ? JSON.stringify({ pt: orientacaoPt, en: orientacaoEn || orientacaoPt }) : null, por || null]);
      if (!r.rowCount) throw new Error('só documentos "disponivel_analise" podem ser decididos');
      return r.rows[0];
    },

    // ---- agendamentos
    /** Pedidos ainda sem horário confirmado (mais próximos primeiro). */
    async listarAgendamentos({ todos = false } = {}) {
      return (await db.q(`select a.id, u.email, a.tipo, a.formato, a.periodo, a.descricao, to_char(a.data_solicitada,'YYYY-MM-DD') as data_solicitada, a.horario_confirmado, a.solicitado_pelo_cliente, a.criado_em
                            from agendamentos a join usuarios u on u.id=a.usuario_id
                           ${todos ? '' : 'where a.horario_confirmado is null'} order by a.data_solicitada nulls last, a.criado_em`)).rows;
    },
    async registrarAgendamento(email, dataSolicitada, tipo, descricao = '') {
      if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dataSolicitada)) throw new Error('data inválida (AAAA-MM-DD)');
      const u = await usuarioPorEmail(email);
      return (await db.q('insert into agendamentos(usuario_id, tipo, descricao, data_solicitada) values ($1,$2,$3,$4) returning id', [u.id, tipo, descricao, dataSolicitada])).rows[0];
    },
    /** Confirma o horário (data e hora no fuso de Dubai, GST UTC+4, sem horário de verão). */
    async confirmarAgendamento(id, dataHoraDubai, por, { avisar = true } = {}) {
      const m = String(dataHoraDubai).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
      if (!m) throw new Error('use AAAA-MM-DDTHH:MM (horário de Dubai)');
      const [ano, mes, dia, hora, min] = m.slice(1).map(Number);
      // confere o calendário e as faixas ANTES de converter (Date.UTC "corrigiria" 31/02 para 03/03 etc.)
      const civil = new Date(Date.UTC(ano, mes - 1, dia));
      if (mes < 1 || mes > 12 || dia < 1 || civil.getUTCFullYear() !== ano || civil.getUTCMonth() !== mes - 1 || civil.getUTCDate() !== dia) throw new Error(`data inexistente: ${dataHoraDubai}`);
      if (hora > 23 || min > 59) throw new Error(`hora inválida: ${dataHoraDubai}`);
      const utc = new Date(Date.UTC(ano, mes - 1, dia, hora - 4, min)); // Dubai = UTC+4, sem horário de verão
      const r = await db.q('update agendamentos set horario_confirmado=$2, confirmado_por=$3 where id=$1 returning id', [id, utc, por || null]);
      if (!r.rowCount) throw new Error('agendamento não encontrado');
      // e-mail automático ao cliente; se falhar, a confirmação continua valendo (o cliente vê na Área do Cliente)
      let emailCliente = 'nao_enviado';
      if (avisar && avisarCliente) {
        const a = (await db.q('select a.tipo, a.formato, u.email, u.idioma from agendamentos a join usuarios u on u.id=a.usuario_id where a.id=$1', [id])).rows[0];
        try { await avisarCliente({ email: a.email, lang: a.idioma, tipo: a.tipo, formato: a.formato, horario: utc }); emailCliente = 'enviado'; }
        catch (e) { emailCliente = 'falhou: ' + e.message; }
      }
      return { id, horarioConfirmado: utc.toISOString(), emailCliente };
    },

    /** Confere volume x banco: apaga temporários e arquivos sem registro com mais de 1 h; relata registros sem arquivo. */
    async reconciliarArquivos({ aplicar = false, idadeMinMs = 60 * 60 * 1000 } = {}) {
      const out = { temporariosApagados: [], orfaosApagados: [], registrosSemArquivo: [] };
      // idadeMinMs <= 0: todos (a data do arquivo pode vir frações de ms à frente do relógio do Node)
      const velho = async (p) => idadeMinMs <= 0 || Date.now() - (await fsp.stat(p)).mtimeMs >= idadeMinMs;
      for (const t of await arquivos.listarTemporarios()) if (await velho(t)) { out.temporariosApagados.push(path.basename(t)); if (aplicar) await arquivos.apagar(t); }
      const chaves = new Set((await db.q('select chave_arquivo from documentos where chave_arquivo is not null')).rows.map((r) => r.chave_arquivo));
      for (const c of await arquivos.listar()) if (!chaves.has(c) && await velho(arquivos.caminho(c))) { out.orfaosApagados.push(c); if (aplicar) await arquivos.apagar(arquivos.caminho(c)); }
      for (const c of chaves) if (!(await arquivos.existe(c))) out.registrosSemArquivo.push(c);
      return { aplicado: aplicar, ...out };
    },
  };
}
