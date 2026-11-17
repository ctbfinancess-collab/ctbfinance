/**
 * Liga a Área do Cliente SOMENTE quando DATABASE_URL e ARQUIVOS_DIR estão configurados no Railway.
 * Sem eles, /api/cliente/status responde { ativo: false } e o portal mostra "acesso em preparação".
 */
import { criarBanco, criarArquivos } from './nucleo.mjs';
import { criarApi } from './api.mjs';
import { enviarEmailAcesso } from './emails.mjs';

export async function iniciarAreaCliente({ origens }) {
  if (!process.env.DATABASE_URL || !process.env.ARQUIVOS_DIR) {
    console.log('[area-cliente] desativada (DATABASE_URL/ARQUIVOS_DIR ausentes)');
    return null;
  }
  const db = criarBanco();
  await db.migrar();
  const arquivos = criarArquivos();
  console.log('[area-cliente] ativa');
  return criarApi({ db, arquivos, origens, enviarEmail: enviarEmailAcesso });
}
