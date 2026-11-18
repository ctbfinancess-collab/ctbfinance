/**
 * Núcleo da Área do Cliente (Railway): banco Postgres, senhas, sessões, arquivos e detecção de formato.
 * Variáveis (somente no Railway, nunca no código):
 *   DATABASE_URL   conexão do Postgres do Railway
 *   ARQUIVOS_DIR   pasta do VOLUME persistente do Railway (ex.: /data/arquivos) — fora da pasta pública
 *   AREA_COOKIE_INSEGURO=1  só para testes locais em http (sem o atributo Secure)
 */
import pg from 'pg';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(crypto.scrypt);
const AQUI = path.dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------ banco
export function criarBanco(url = process.env.DATABASE_URL) {
  const ssl = /sslmode=require/.test(url || '') ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({ connectionString: url, max: 10, ssl });
  return {
    pool,
    q: (sql, params) => pool.query(sql, params),
    async transacao(fn) {
      const c = await pool.connect();
      try { await c.query('begin'); const r = await fn((sql, p) => c.query(sql, p)); await c.query('commit'); return r; }
      catch (e) { await c.query('rollback').catch(() => {}); throw e; }
      finally { c.release(); }
    },
    async migrar() { await pool.query(fs.readFileSync(path.join(AQUI, 'schema.sql'), 'utf8')); },
    fechar: () => pool.end(),
  };
}

// ------------------------------------------------------------------ senhas e tokens
const SCRYPT = { N: 16384, r: 8, p: 1, len: 64 };
export async function gerarHashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = await scrypt(senha.normalize('NFKC'), sal, SCRYPT.len, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('base64url')}$${h.toString('base64url')}`;
}
const HASH_FALSO = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86);
/** Compara em tempo constante; sem usuário, compara com um hash falso (mesmo custo de tempo). */
export async function conferirSenha(senha, armazenado) {
  const [alg, N, r, p, salB, hB] = String(armazenado || HASH_FALSO).split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hB, 'base64url');
  const h = await scrypt(String(senha).normalize('NFKC'), Buffer.from(salB, 'base64url'), esperado.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return armazenado ? crypto.timingSafeEqual(h, esperado) : false;
}
export function politicaSenha(senha, email) {
  if (typeof senha !== 'string' || senha.length < 10) return 'curta';
  if (senha.length > 200) return 'longa';
  if (email && senha.toLowerCase().includes(String(email).split('@')[0].toLowerCase())) return 'parecida_email';
  if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) return 'fraca';
  return null;
}
export const novoToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// ------------------------------------------------------------------ sessões (cookie HttpOnly)
export const COOKIE = 'ctb_sessao';
export const SESSAO_OCIOSA_MS = 2 * 60 * 60 * 1000;   // 2 h sem uso encerra
export const SESSAO_MAX_MS = 12 * 60 * 60 * 1000;     // 12 h no máximo
export function cookieSessao(token) {
  const seguro = process.env.AREA_COOKIE_INSEGURO === '1' ? '' : '; Secure';
  // sem Max-Age: termina ao fechar o navegador; SameSite=Strict: não vai em requisições de outros sites
  return `${COOKIE}=${token}; Path=/api/cliente; HttpOnly; SameSite=Strict${seguro}`;
}
export function cookieApagar() {
  const seguro = process.env.AREA_COOKIE_INSEGURO === '1' ? '' : '; Secure';
  return `${COOKIE}=; Path=/api/cliente; HttpOnly; SameSite=Strict; Max-Age=0${seguro}`;
}
export function lerCookie(req, nome = COOKIE) {
  const c = req.headers.cookie || '';
  for (const parte of c.split(';')) { const [k, ...v] = parte.trim().split('='); if (k === nome) return v.join('='); }
  return null;
}

// ------------------------------------------------------------------ arquivos (volume do Railway)
export function criarArquivos(dir = process.env.ARQUIVOS_DIR) {
  if (!dir) throw new Error('ARQUIVOS_DIR não configurado');
  const docs = path.join(dir, 'docs'), tmp = path.join(dir, 'tmp');
  fs.mkdirSync(docs, { recursive: true, mode: 0o700 }); fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
  const seguro = (chave) => { if (!/^[0-9a-f-]{36}$/.test(chave)) throw new Error('chave inválida'); return path.join(docs, chave); };
  return {
    dir, docs, tmp,
    caminho: seguro,
    temporario: () => path.join(tmp, crypto.randomUUID()),
    async efetivar(tmpPath) { const chave = crypto.randomUUID(); await fsp.rename(tmpPath, seguro(chave)); return chave; },
    abrir: (chave) => fsp.open(seguro(chave), 'r'),
    async existe(chave) { try { await fsp.access(seguro(chave)); return true; } catch { return false; } },
    async apagar(p) { await fsp.rm(p, { force: true }); },
    async listar() { return (await fsp.readdir(docs)).filter((n) => /^[0-9a-f-]{36}$/.test(n)); },
    async listarTemporarios() { return (await fsp.readdir(tmp)).map((n) => path.join(tmp, n)); },
  };
}

// ------------------------------------------------------------------ formato (detecção PRELIMINAR)
// Início (assinatura) e fim (marcador de término) do arquivo. Não decodifica o documento inteiro,
// não comprova autenticidade nem ausência de conteúdo malicioso.
const contem = (b, x) => Buffer.from(b).indexOf(x) !== -1;
export const FORMATOS = {
  'application/pdf': { ext: 'pdf', inicio: (b) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-', fim: (b) => contem(b, Buffer.from('%%EOF')) },
  'image/jpeg': { ext: 'jpg', inicio: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, fim: (b) => contem(b, Buffer.from([0xff, 0xd9])) },
  'image/png': { ext: 'png', inicio: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), fim: (b) => contem(b, Buffer.from('IEND')) },
};
export function conteudoConfere(tipo, inicio, fim = inicio) {
  const f = FORMATOS[tipo];
  return Boolean(f && f.inicio(Buffer.from(inicio)) && f.fim(Buffer.from(fim)));
}
export const ORIENTACOES = {
  conteudo_nao_confere: {
    pt: 'O conteúdo do arquivo não corresponde a um PDF, JPEG ou PNG válido. Exporte o documento novamente nesses formatos e envie outra vez.',
    en: 'The file content does not match a valid PDF, JPEG or PNG. Please export the document again in one of these formats and upload it again.',
  },
};
