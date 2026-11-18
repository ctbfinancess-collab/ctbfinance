#!/usr/bin/env node
/**
 * Comandos da equipe CTB — Área do Cliente (Railway).
 * ONDE RODAR (ver AREA-DO-CLIENTE-RAILWAY.md):
 *  - Comandos que mexem nos ARQUIVOS (docs:baixar, arquivos:reconciliar) precisam do volume: rodar DENTRO do
 *    container do serviço do site, com `railway ssh` (o volume só existe lá, montado em /data).
 *  - Comandos só de BANCO podem rodar no container (`railway ssh`) ou localmente com `railway run`
 *    (executa no SEU computador com as variáveis do Railway; exige acesso de rede ao Postgres). `railway run`
 *    NÃO traz o volume para o seu computador.
 * Variáveis: DATABASE_URL (todos), ARQUIVOS_DIR (só comandos de arquivos), RESEND_API_KEY/CONTACT_EMAIL_FROM (convites).
 *
 *   usuarios:convidar <email> ["Nome"] [pt|en]
 *   usuarios:bloquear <email>        usuarios:desbloquear <email>
 *   usuarios:ver <email>             (ficha: dados do perfil, incluindo o passaporte completo)
 *   usuarios:passaporte <email> <número> [AAAA-MM-DD]   (equipe grava já conferido; trava o campo)
 *   usuarios:passaporte-conferir <email>   (confere o que o cliente informou; trava o campo)
 *   usuarios:passaporte-liberar <email>    (destrava: o cliente volta a poder editar)
 *   equipe:conceder <email>          equipe:revogar <email>          equipe:listar
 *   instrumentos:aprovador <email>   instrumentos:aprovador-revogar <email>   (quem pode marcar Aprovada/Concluída)
 *   docs:listar [status]             docs:baixar <id> <pasta>
 *   docs:aprovar <id>                docs:rejeitar <id> "<orientação PT>" ["<orientação EN>"]
 *   agenda:listar [--todos]          (padrão: só os pedidos sem horário confirmado)
 *   agenda:registrar <email> <AAAA-MM-DD> "<tipo>" ["descrição"]
 *   agenda:confirmar <id> <AAAA-MM-DDTHH:MM> [--sem-email] [--remarcar]   (horário de Dubai; avisa o cliente por e-mail;
 *                                       --remarcar troca um horário já confirmado)
 *   arquivos:reconciliar [--aplicar]           (padrão: simulação)
 */
import { criarBanco, criarArquivos } from '../server/area/nucleo.mjs';
const COMANDOS_DE_ARQUIVOS = new Set(['docs:baixar', 'arquivos:reconciliar']);
import { criarApi } from '../server/area/api.mjs';
import { criarAdmin } from '../server/area/admin.mjs';
import { enviarEmailAcesso, enviarConfirmacaoAgendamento } from '../server/area/emails.mjs';

const [cmd, ...a] = process.argv.slice(2);
const db = criarBanco();
// o volume só é aberto pelos comandos que mexem em arquivos (os demais funcionam sem ARQUIVOS_DIR)
if (COMANDOS_DE_ARQUIVOS.has(cmd) && !process.env.ARQUIVOS_DIR) {
  console.error(`Erro: "${cmd}" precisa do volume (ARQUIVOS_DIR). No Railway, rode dentro do container com \`railway ssh\`.`);
  await db.fechar(); process.exit(1);
}
const arquivos = COMANDOS_DE_ARQUIVOS.has(cmd) ? criarArquivos() : null;
if (COMANDOS_DE_ARQUIVOS.has(cmd) && !process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.CTB_ADMIN_VOLUME_LOCAL) {
  console.error('Aviso: este comando precisa do volume do serviço. No Railway, rode com `railway ssh` dentro do container.');
}
await db.migrar();
const api = criarApi({ db, arquivos, origens: new Set(), enviarEmail: enviarEmailAcesso });
const adm = criarAdmin({ db, arquivos, api, avisarCliente: enviarConfirmacaoAgendamento });
const quem = process.env.USER || 'equipe';
const C = {
  'usuarios:convidar': () => adm.convidar(a[0], { nome: a[1] || '', lang: a[2] === 'en' ? 'en' : 'pt' }),
  'usuarios:bloquear': () => adm.bloquear(a[0]), 'usuarios:desbloquear': () => adm.desbloquear(a[0]),
  'usuarios:ver': () => adm.verCliente(a[0]),
  'usuarios:passaporte': () => adm.definirDadosRestritos(a[0], { passportnumber: a[1], passportexpirationdate: a[2] }, quem),
  'usuarios:passaporte-conferir': () => adm.conferirPassaporte(a[0], quem),
  'usuarios:passaporte-liberar': () => adm.liberarPassaporte(a[0]),
  'equipe:conceder': () => adm.concederEquipe(a[0]), 'equipe:revogar': () => adm.revogarEquipe(a[0]), 'equipe:listar': () => adm.listarEquipe(),
  'instrumentos:aprovador': () => adm.aprovadorInstrumentos(a[0], true), 'instrumentos:aprovador-revogar': () => adm.aprovadorInstrumentos(a[0], false),
  'docs:listar': () => adm.listarDocumentos(a[0]), 'docs:baixar': () => adm.baixarDocumento(a[0], a[1] || '.'),
  'docs:aprovar': () => adm.decidir(a[0], 'aprovado', { por: quem }),
  'docs:rejeitar': () => adm.decidir(a[0], 'rejeitado', { orientacaoPt: a[1], orientacaoEn: a[2], por: quem }),
  'agenda:listar': () => adm.listarAgendamentos({ todos: a.includes('--todos') }),
  'agenda:registrar': () => adm.registrarAgendamento(a[0], a[1], a[2], a[3]),
  'agenda:confirmar': () => adm.confirmarAgendamento(a[0], a[1], quem, { avisar: !a.includes('--sem-email'), remarcar: a.includes('--remarcar') }),
  'arquivos:reconciliar': () => adm.reconciliarArquivos({ aplicar: a.includes('--aplicar') }),
};
try {
  if (!C[cmd]) { console.log((await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]); process.exitCode = 1; }
  else console.log(JSON.stringify(await C[cmd](), null, 2));
} catch (e) { console.error('Erro:', e.message); process.exitCode = 1; }
finally { await db.fechar(); }
