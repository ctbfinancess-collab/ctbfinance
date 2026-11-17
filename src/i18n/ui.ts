export const languages = { pt: 'Português', en: 'English' } as const;
export const defaultLang = 'pt';
export type Lang = keyof typeof languages;

export const ui = {
  pt: {
    'site.title': 'CTB Finances Dubai — Soluções Financeiras Internacionais',
    'site.description':
      'Intermediação bancária, análise de crédito e intermediação de financiamentos, com a seriedade, a discrição e a visão internacional de Dubai.',
    'nav.home': 'Início',
    'nav.about': 'Sobre',
    'nav.solutions': 'Soluções',
    'nav.investments': 'Investimentos',
    'nav.dubai': 'Dubai',
    'nav.governance': 'Governança',
    'nav.contact': 'Contato',
    'nav.newsletter': 'Newsletter',
    'nav.account': 'Área do Cliente',
    'nav.signup': 'Seja nosso cliente',
    'nav.soon': 'Em breve',
    'hero.eyebrow': 'Dubai · Intermediação Financeira',
    'hero.title.1': 'Soluções Financeiras',
    'hero.title.2': 'Internacionais',
    'hero.lead':
      'Intermediação bancária, análise de crédito e intermediação de financiamentos, com a seriedade, a discrição e a visão internacional de Dubai.',
    'hero.cta.primary': 'Conheça nossas Soluções',
    'hero.cta.secondary': 'Fale com um Especialista',
    'pillar.security': 'Segurança|e Privacidade',
    'pillar.wealth': 'Intermediação|Bancária',
    'pillar.investments': 'Análise|de Crédito',
    'pillar.connection': 'Conexão|Internacional',
    'pillar.business': 'Intermediação de|Financiamentos',
    'footer.rights': 'Todos os direitos reservados.',
    'btn.back': 'Voltar ao início',
  },
  en: {
    'site.title': 'CTB Finances Dubai — International Financial Solutions',
    'site.description':
      'Bank brokerage, credit review and financing brokerage, with the seriousness, discretion and international outlook of Dubai.',
    'nav.home': 'Home',
    'nav.about': 'About',
    'nav.solutions': 'Solutions',
    'nav.investments': 'Investments',
    'nav.dubai': 'Dubai',
    'nav.governance': 'Governance',
    'nav.contact': 'Contact',
    'nav.newsletter': 'Newsletter',
    'nav.account': 'Client Area',
    'nav.signup': 'Become a client',
    'nav.soon': 'Coming soon',
    'hero.eyebrow': 'Dubai · Financial Intermediation',
    'hero.title.1': 'International',
    'hero.title.2': 'Financial Solutions',
    'hero.lead':
      'Bank brokerage, credit review and financing brokerage, with the seriousness, discretion and international outlook of Dubai.',
    'hero.cta.primary': 'Explore our Solutions',
    'hero.cta.secondary': 'Speak with a Specialist',
    'pillar.security': 'Security|& Privacy',
    'pillar.wealth': 'Bank|Brokerage',
    'pillar.investments': 'Credit|Review',
    'pillar.connection': 'International|Connectivity',
    'pillar.business': 'Financing|Brokerage',
    'footer.rights': 'All rights reserved.',
    'btn.back': 'Back to home',
  },
} as const;

export type UiKey = keyof (typeof ui)['pt'];
