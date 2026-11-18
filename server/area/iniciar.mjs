/**
 * Liga a Área do Cliente SOMENTE quando DATABASE_URL e ARQUIVOS_DIR estão configurados no Railway.
 * Sem eles, /api/cliente/status responde { ativo: false } e o portal mostra "acesso em preparação".
 */
import { criarBanco, criarArquivos } from './nucleo.mjs';
import { criarApi, limparRegistrosAntigos } from './api.mjs';
import { enviarEmailAcesso, avisarEquipeAgendamento, enviarConfirmacaoAgendamento, avisarEquipeOperacao, avisarEquipeInstrumento } from './emails.mjs';
import { criarAdmin } from './admin.mjs';
import { criarPainel } from './painel.mjs';

export async function iniciarAreaCliente({ origens }) {
  if (!process.env.DATABASE_URL || !process.env.ARQUIVOS_DIR) {
    console.log('[area-cliente] desativada (DATABASE_URL/ARQUIVOS_DIR ausentes)');
    return null;
  }
  const db = criarBanco();
  await db.migrar();
  const arquivos = criarArquivos();
  const limpar = () => limparRegistrosAntigos(db).catch((e) => console.error('[area-cliente] limpeza:', e.message));
  limpar(); setInterval(limpar, 60 * 60 * 1000).unref();
  console.log('[area-cliente] ativa');
  const api = criarApi({ db, arquivos, origens, enviarEmail: enviarEmailAcesso, avisarEquipe: avisarEquipeAgendamento, avisarOperacao: avisarEquipeOperacao, avisarInstrumento: avisarEquipeInstrumento });
  const adm = criarAdmin({ db, arquivos, api, avisarCliente: enviarConfirmacaoAgendamento });
  api.ligarPainel(({ json, lerJson, instrumentos }) => criarPainel({ db, adm, json, lerJson, instrumentos }));
  return api;
}
