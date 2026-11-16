# CTB Finances — Site institucional

Site independente (Astro), separado do aplicativo Flutter na raiz do repositório.
Não compartilha código, Firebase nem configurações de publicação com o app.

## Rodar localmente

```bash
cd site
npm install      # só na primeira vez
npm run dev      # http://localhost:4321
```

- Português: `/`
- Inglês: `/en/`

## Estrutura

- `src/pages/` — páginas (pt na raiz, en em `en/`)
- `src/layouts/` — layout base (head, header, footer)
- `src/components/` — componentes reutilizáveis
- `src/i18n/` — textos e utilitários de idioma
- `src/styles/tokens.css` — cores e tipografia da marca (preto, dourado, champanhe)
- `public/` — arquivos estáticos (favicon, imagens)
