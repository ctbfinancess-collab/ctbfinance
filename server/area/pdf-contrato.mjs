/**
 * Gera o PDF de um contrato no papel timbrado da CTB (o mesmo fundo dos modelos enviados pela titular).
 * Puro JavaScript (pdf-lib + fontkit): nada de navegador no servidor. Fonte DejaVu Sans (licença livre, em modelos/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const AQUI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'modelos');
let ativos = null;
const carregar = () => (ativos ||= {
  fundo: fs.readFileSync(path.join(AQUI, 'timbrado.jpg')),
  normal: fs.readFileSync(path.join(AQUI, 'DejaVuSans.ttf')),
  negrito: fs.readFileSync(path.join(AQUI, 'DejaVuSans-Bold.ttf')),
});

// A4 em pontos; área útil = parte creme do timbrado (cabeçalho até ~18% da altura, rodapé a partir de ~81%)
const L = 595.28, A = 841.89;
const MARGEM_E = 54, MARGEM_D = 54, TOPO = A - 150, BASE = 170;
const ESPRESSO = rgb(0x35 / 255, 0x24 / 255, 0x1d / 255), CAFE = rgb(0x62 / 255, 0x48 / 255, 0x3a / 255), BRONZE = rgb(0xa8 / 255, 0x74 / 255, 0x2f / 255);

/** Quebra o texto em linhas que cabem na largura (respeita palavras; corta palavras longas demais). */
function quebrar(texto, fonte, tam, largura) {
  const linhas = [];
  let atual = '';
  for (const palavra of String(texto).split(/\s+/).filter(Boolean)) {
    const teste = atual ? atual + ' ' + palavra : palavra;
    if (fonte.widthOfTextAtSize(teste, tam) <= largura) { atual = teste; continue; }
    if (atual) linhas.push(atual);
    let p = palavra;
    while (fonte.widthOfTextAtSize(p, tam) > largura) {   // palavra sozinha maior que a linha
      let n = p.length; while (n > 1 && fonte.widthOfTextAtSize(p.slice(0, n), tam) > largura) n--;
      linhas.push(p.slice(0, n)); p = p.slice(n);
    }
    atual = p;
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [''];
}

/** Interpreta a marcação do corpo: "# título", "## seção", "• item", parágrafos separados por linha em branco. */
export function blocos(texto) {
  const out = [];
  let par = [];
  const fechar = () => { if (par.length) out.push({ t: 'p', s: par.join(' ') }); par = []; };
  for (const bruta of String(texto || '').replace(/\r/g, '').split('\n')) {
    const l = bruta.trim();
    if (!l) { fechar(); continue; }
    if (l.startsWith('## ')) { fechar(); out.push({ t: 'h', s: l.slice(3) }); continue; }
    if (l.startsWith('# ')) { fechar(); out.push({ t: 'titulo', s: l.slice(2) }); continue; }
    if (/^[•\-*] /.test(l)) { fechar(); out.push({ t: 'li', s: l.slice(2) }); continue; }
    par.push(l);
  }
  fechar();
  return out;
}

/**
 * @param {{ rotulo: string, referencia: string, rascunho: boolean, texto: string, assinaturas: string[][], titulo?: string }} c
 * @returns {Promise<Uint8Array>}
 */
export async function gerarPdf(c) {
  const a = carregar();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonte = await doc.embedFont(a.normal, { subset: true });
  const negrito = await doc.embedFont(a.negrito, { subset: true });
  const fundo = await doc.embedJpg(a.fundo);
  doc.setTitle(`${c.titulo || c.rotulo} · ${c.referencia}`);
  doc.setAuthor('CTB FINANCE BROKER L.L.C');
  doc.setCreator('CTB Finances');
  doc.setProducer('CTB Finances');

  const largura = L - MARGEM_E - MARGEM_D;
  const paginas = [];
  let pg, y;
  const novaPagina = () => {
    pg = doc.addPage([L, A]);
    pg.drawImage(fundo, { x: 0, y: 0, width: L, height: A });
    paginas.push(pg);
    y = TOPO - 26;
  };
  const precisa = (h) => { if (y - h < BASE) novaPagina(); };
  const linha = (s, f, tam, cor, x = MARGEM_E) => { pg.drawText(s, { x, y, size: tam, font: f, color: cor }); };

  novaPagina();
  for (const b of blocos(c.texto)) {
    if (b.t === 'titulo') {
      const ls = quebrar(b.s, negrito, 13, largura);
      precisa(ls.length * 18 + 8);
      for (const s of ls) { const w = negrito.widthOfTextAtSize(s, 13); linha(s, negrito, 13, ESPRESSO, (L - w) / 2); y -= 18; }
      y -= 8;
    } else if (b.t === 'h') {
      const ls = quebrar(b.s, negrito, 10.5, largura);
      precisa(ls.length * 15 + 26);   // não deixa título de seção sozinho no fim da página
      y -= 4;
      for (const s of ls) { linha(s, negrito, 10.5, CAFE); y -= 15; }
      y -= 3;
    } else if (b.t === 'li') {
      const ls = quebrar(b.s, fonte, 9.5, largura - 14);
      for (let i = 0; i < ls.length; i++) {
        precisa(14);
        if (i === 0) linha('•', fonte, 9.5, BRONZE);
        linha(ls[i], fonte, 9.5, ESPRESSO, MARGEM_E + 14); y -= 14;
      }
      y -= 3;
    } else {
      const ls = quebrar(b.s, fonte, 9.5, largura);
      for (const s of ls) { precisa(14); linha(s, fonte, 9.5, ESPRESSO); y -= 14; }
      y -= 7;
    }
  }
  // assinaturas: lado a lado quando cabem; o bloco inteiro vai para a próxima página se não couber
  const ass = (c.assinaturas || []).filter((x) => x && x.length);
  if (ass.length) {
    const col = ass.length > 1 ? (largura - 24) / 2 : largura;
    const alturas = ass.map((x) => x.reduce((n, s) => n + quebrar(s, fonte, 8.5, col).length, 0));
    const h = 46 + Math.max(...alturas) * 12;
    precisa(h + 10);
    y -= 34;
    ass.forEach((bloco, i) => {
      const x = MARGEM_E + i * (col + 24);
      pg.drawLine({ start: { x, y }, end: { x: x + Math.min(col, 230), y }, thickness: 0.7, color: CAFE });
      let yy = y - 13;
      bloco.forEach((s, j) => {
        for (const p of quebrar(s, j === 0 ? negrito : fonte, 8.5, col)) { pg.drawText(p, { x, y: yy, size: 8.5, font: j === 0 ? negrito : fonte, color: ESPRESSO }); yy -= 12; }
      });
    });
    y -= h;
  }
  // só a numeração no topo de cada página (sem selo de rótulo/rascunho, a pedido da titular)
  paginas.forEach((p, i) => {
    const num = `${i + 1} / ${paginas.length}`;
    p.drawText(num, { x: L - MARGEM_D - fonte.widthOfTextAtSize(num, 7.5), y: TOPO, size: 7.5, font: fonte, color: BRONZE });
  });
  return doc.save();
}
