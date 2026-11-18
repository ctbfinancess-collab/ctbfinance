/**
 * Operações da equipe CTB (rodam no servidor do Railway ou num computador autorizado com DATABASE_URL).
 * Nunca expostas pela web. Usadas pelo script scripts/ctb-admin.mjs e pelos testes.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const norm = (e) => String(e || '').trim().toLowerCase();

export function criarAdmin({ db, arquivos, api }) {
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
      const u = (await db.q(`insert into usuarios(email) values ($1) on conflict (email) do update set email=excluded.email returning *`, [e])).rows[0];
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
    /** Dados de cadastro que só a equipe altera (ex.: passaporte conferido). */
    async definirDadosRestritos(email, dados) {
      const u = await usuarioPorEmail(email);
      const permitidos = {}; for (const k of ['passportnumber', 'passportexpirationdate']) if (typeof dados[k] === 'string') permitidos[k] = dados[k];
      await db.q(`insert into perfis(usuario_id, dados) values ($1, $2::jsonb) on conflict (usuario_id) do update set dados = perfis.dados || excluded.dados`, [u.id, JSON.stringify(permitidos)]);
      return { email: u.email, campos: Object.keys(permitidos) };
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
      const destino = path.join(pasta, path.basename(d.nome));
      await fsp.copyFile(arquivos.caminho(d.chave_arquivo), destino);
      return { salvo: destino };
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
    async registrarAgendamento(email, dataSolicitada, tipo, descricao = '') {
      if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dataSolicitada)) throw new Error('data inválida (AAAA-MM-DD)');
      const u = await usuarioPorEmail(email);
      return (await db.q('insert into agendamentos(usuario_id, tipo, descricao, data_solicitada) values ($1,$2,$3,$4) returning id', [u.id, tipo, descricao, dataSolicitada])).rows[0];
    },
    /** Confirma o horário (data e hora no fuso de Dubai, GST UTC+4, sem horário de verão). */
    async confirmarAgendamento(id, dataHoraDubai, por) {
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
      return { id, horarioConfirmado: utc.toISOString() };
    },

    /** Confere volume x banco: apaga temporários e arquivos sem registro com mais de 1 h; relata registros sem arquivo. */
    async reconciliarArquivos({ aplicar = false, idadeMinMs = 60 * 60 * 1000 } = {}) {
      const out = { temporariosApagados: [], orfaosApagados: [], registrosSemArquivo: [] };
      const velho = async (p) => Date.now() - (await fsp.stat(p)).mtimeMs > idadeMinMs;
      for (const t of await arquivos.listarTemporarios()) if (await velho(t)) { out.temporariosApagados.push(path.basename(t)); if (aplicar) await arquivos.apagar(t); }
      const chaves = new Set((await db.q('select chave_arquivo from documentos where chave_arquivo is not null')).rows.map((r) => r.chave_arquivo));
      for (const c of await arquivos.listar()) if (!chaves.has(c) && await velho(arquivos.caminho(c))) { out.orfaosApagados.push(c); if (aplicar) await arquivos.apagar(arquivos.caminho(c)); }
      for (const c of chaves) if (!(await arquivos.existe(c))) out.registrosSemArquivo.push(c);
      return { aplicado: aplicar, ...out };
    },
  };
}
