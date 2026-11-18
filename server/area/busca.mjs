/**
 * Busca da equipe: cada palavra digitada precisa aparecer em ALGUM dos campos (ordem livre),
 * sem diferenciar maiúsculas nem acentos. Ex.: "caio batista" encontra "Caio da Silva Batista".
 */
const COM = 'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
const SEM = 'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn';
const normSql = (expr) => `translate(lower(coalesce(${expr},'')), '${COM}', '${SEM}')`;
const normJs = (s) => [...String(s).toLowerCase()].map((ch) => { const i = COM.indexOf(ch); return i >= 0 ? SEM[i] : ch; }).join('');

/** Acrescenta a `where` (lista de condições) e a `vals` (parâmetros) o filtro da busca `texto` nas `colunas` (SQL). */
export function filtroBusca(texto, colunas, where, vals) {
  const termos = normJs(String(texto || '').trim().slice(0, 80)).split(/\s+/).filter(Boolean).slice(0, 6);
  for (const t of termos) {
    vals.push('%' + t.replace(/[\\%_]/g, (c) => '\\' + c) + '%');
    const n = vals.length;
    where.push('(' + colunas.map((c) => `${normSql(c)} like $${n}`).join(' or ') + ')');
  }
}
