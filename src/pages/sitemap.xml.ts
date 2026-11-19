import type { APIRoute } from 'astro';
import { routes } from '../i18n/utils';

/** Sitemap com as versões PT/EN de cada página ligadas por hreflang. */
export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://ctbfinances.ae');
  const abs = (p: string) => new URL(p, base).href;
  const today = new Date().toISOString().slice(0, 10);
  // Área do Cliente fica acessível pelo site, mas fora do Google (noindex) e do sitemap
  const urls = Object.entries(routes).filter(([k]) => k !== 'clientArea').map(([, r]) => r).flatMap((r) =>
    (['pt', 'en'] as const).map((lang) => `  <url>
    <loc>${abs(r[lang])}</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="${abs(r.pt)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${abs(r.en)}"/>
  </url>`)
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
