// @ts-check
import { defineConfig } from 'astro/config';

// Site institucional CTB Finances — independente do app Flutter.
export default defineConfig({
  // Ajustar para o domínio definitivo antes de publicar.
  site: 'https://ctbfinances.ae',
  i18n: {
    defaultLocale: 'pt',
    locales: ['pt', 'en'],
    routing: {
      prefixDefaultLocale: false, // pt em "/", inglês em "/en/"
    },
  },
});
