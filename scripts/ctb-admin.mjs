#!/usr/bin/env node
/**
 * Comandos da equipe CTB — Área do Cliente (Railway). Precisa de DATABASE_URL e ARQUIVOS_DIR
 * (no Railway: `railway run node scripts/ctb-admin.mjs ...` ou pelo shell do serviço).
 * E-mails (convite/redefinição) usam RESEND_API_KEY e CONTACT_EMAIL_FROM.
 *
 *   usuarios:convidar <email> ["Nome"] [pt|en]
 *   usuarios:bloquear <email>        usuarios:desbloquear <email>
 *   usuarios:passaporte <email> <número> [validade]
 *   equipe:conceder <email>          equipe:revogar <email>          equipe:listar
 *   docs:listar [status]             docs:baixar <id> <pasta>
 *   docs:aprovar <id>                docs:rejeitar <id> "<orientação PT>" ["<orientação EN>"]
 *   agenda:registrar <email> <AAAA-MM-DD> "<tipo>" ["descrição"]
 *   agenda:confirmar <id> <AAAA-MM-DDTHH:MM>   (horário de Dubai)
 *   arquivos:reconciliar [--aplicar]           (padrão: simulação)
 */
import { criarBanco, criarArquivos } from '../server/area/nucleo.mjs';
import { criarApi } from '../server/area/api.mjs';
import { criarAdmin } from '../server/area/admin.mjs';
import { enviarEmailAcesso } from '../server/area/emails.mjs';

const [cmd, ...a] = process.argv.slice(2);
const db = criarBanco(); const arquivos = criarArquivos();
await db.migrar();
const api = criarApi({ db, arquivos, origens: new Set(), enviarEmail: enviarEmailAcesso });
const adm = criarAdmin({ db, arquivos, api });
const quem = process.env.USER || 'equipe';
const C = {
  'usuarios:convidar': () => adm.convidar(a[0], { nome: a[1] || '', lang: a[2] === 'en' ? 'en' : 'pt' }),
  'usuarios:bloquear': () => adm.bloquear(a[0]), 'usuarios:desbloquear': () => adm.desbloquear(a[0]),
  'usuarios:passaporte': () => adm.definirDadosRestritos(a[0], { passportnumber: a[1], passportexpirationdate: a[2] }),
  'equipe:conceder': () => adm.concederEquipe(a[0]), 'equipe:revogar': () => adm.revogarEquipe(a[0]), 'equipe:listar': () => adm.listarEquipe(),
  'docs:listar': () => adm.listarDocumentos(a[0]), 'docs:baixar': () => adm.baixarDocumento(a[0], a[1] || '.'),
  'docs:aprovar': () => adm.decidir(a[0], 'aprovado', { por: quem }),
  'docs:rejeitar': () => adm.decidir(a[0], 'rejeitado', { orientacaoPt: a[1], orientacaoEn: a[2], por: quem }),
  'agenda:registrar': () => adm.registrarAgendamento(a[0], a[1], a[2], a[3]),
  'agenda:confirmar': () => adm.confirmarAgendamento(a[0], a[1], quem),
  'arquivos:reconciliar': () => adm.reconciliarArquivos({ aplicar: a.includes('--aplicar') }),
};
try {
  if (!C[cmd]) { console.log((await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]); process.exitCode = 1; }
  else console.log(JSON.stringify(await C[cmd](), null, 2));
} catch (e) { console.error('Erro:', e.message); process.exitCode = 1; }
finally { await db.fechar(); }
