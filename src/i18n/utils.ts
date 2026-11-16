import { ui, defaultLang, type Lang, type UiKey } from './ui';

export function getLangFromUrl(url: URL): Lang {
  const [, first] = url.pathname.split('/');
  return first in ui ? (first as Lang) : defaultLang;
}

export function useTranslations(lang: Lang) {
  return (key: UiKey) => ui[lang][key] ?? ui[defaultLang][key];
}

/** Gera o caminho localizado: pt sem prefixo, en com "/en". */
export function localizePath(path: string, lang: Lang): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return lang === defaultLang ? clean : `/${lang}${clean === '/' ? '/' : clean}`;
}

/** Páginas com endereço próprio em cada idioma. */
export const routes = {
  home: { pt: '/', en: '/en/' },
  about: { pt: '/sobre/', en: '/en/about/' },
  solutions: { pt: '/solucoes/', en: '/en/solutions/' },
  investments: { pt: '/investimentos/', en: '/en/investments/' },
  governance: { pt: '/governanca/', en: '/en/governance/' },
  privacy: { pt: '/privacidade/', en: '/en/privacy/' },
  terms: { pt: '/termos/', en: '/en/terms/' },
  legal: { pt: '/aviso-legal/', en: '/en/legal-notice/' },
  contact: { pt: '/contato/', en: '/en/contact/' },
} as const;
export type RouteKey = keyof typeof routes;

/** Descobre qual página está aberta (para o seletor PT/EN levar à mesma página no outro idioma). */
export function getRouteKey(url: URL): RouteKey {
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  for (const [key, paths] of Object.entries(routes)) {
    if (Object.values(paths).includes(path as never)) return key as RouteKey;
  }
  return 'home';
}
