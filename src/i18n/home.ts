/**
 * Textos da página inicial (abaixo do hero).
 * Regra: nada de licenças, números, resultados, parceiros, garantias
 * ou autorizações regulatórias que não tenham sido confirmados.
 */
import type { Lang } from './ui';

export const home = {
  pt: {
    about: {
      eyebrow: 'Quem somos',
      title: 'Uma visão global, uma atuação estratégica',
      lead: 'A CTB Finances é uma empresa sediada em Dubai, dedicada a oferecer a clientes privados e empresas uma abordagem financeira estratégica, discreta e conectada ao mundo.',
      body: 'A partir de um dos centros de negócios mais dinâmicos do mundo, trabalhamos para compreender cada objetivo em profundidade e construir caminhos sob medida, com a seriedade e o cuidado que decisões financeiras exigem.',
      image: 'Caderno de couro com o emblema dourado da CTB Finances e caneta-tinteiro',
    },
    areas: {
      eyebrow: 'Nossas áreas de atuação',
      title: 'Soluções pensadas para cada etapa',
      items: [
        { icon: 'estruturacao', title: 'Intermediação Bancária', text: 'Aproximação entre clientes e instituições bancárias, facilitando o relacionamento e a identificação de alternativas compatíveis com diferentes necessidades financeiras.' },
        { icon: 'visao', title: 'Análise de Crédito', text: 'Apoio à avaliação de informações financeiras e documentação relacionada a operações de crédito, contribuindo para processos de análise mais organizados e transparentes.' },
        { icon: 'consultoria', title: 'Intermediação de Financiamentos', text: 'Apoio na identificação e intermediação de oportunidades de financiamento, conectando necessidades de clientes a possíveis instituições financiadoras.' },
      ],
      note: 'A CTB Finances atua como intermediária e não é uma instituição bancária. A disponibilidade de cada serviço depende de análise prévia.',
      more: 'Conheça nossas soluções',
    },
    vision: {
      eyebrow: 'Visão de futuro',
      title: 'Inovação com visão internacional',
      text: 'Acompanhamos as transformações do mercado financeiro com o olhar no futuro, combinando tecnologia, relacionamento e a solidez de Dubai.',
      button: 'Conheça a CTB Finances',
    },
    dubai: {
      eyebrow: 'Dubai',
      title: 'Dubai como centro estratégico',
      lead: 'Entre o Oriente e o Ocidente, Dubai se consolidou como ponto de encontro de empresas, investidores e famílias de todo o mundo.',
      body: 'Sua localização privilegiada, sua infraestrutura de alto padrão e seu ambiente cosmopolita fazem da cidade uma base natural para quem pensa os negócios em escala internacional. É daqui que a CTB Finances olha para o mundo.',
      image: 'Lounge corporativo com globo dourado, poltrona e vista para o Burj Khalifa, em Dubai',
    },
    philosophy: {
      eyebrow: 'Nossa filosofia de relacionamento',
      title: 'Relações construídas com confiança',
      items: [
        { icon: 'discricao', title: 'Discrição', text: 'Tratamos cada informação com o sigilo e o respeito que ela merece.' },
        { icon: 'relacionamento', title: 'Transparência', text: 'Comunicação clara em cada etapa, para decisões tomadas com segurança.' },
        { icon: 'visao', title: 'Visão estratégica', text: 'Olhar de longo prazo, alinhado aos objetivos de cada cliente.' },
        { icon: 'atendimento', title: 'Atendimento personalizado', text: 'Cada relação é única — e acompanhada de perto, de forma dedicada.' },
      ],
    },
    cta: {
      eyebrow: 'Contato',
      title: 'Seu próximo passo começa com uma conversa.',
      text: 'Conte-nos sobre seus objetivos. Nossa equipe retornará com atenção e discrição.',
      button: 'Fale conosco',
      href: '/contato/',
    },
  },
  en: {
    about: {
      eyebrow: 'About us',
      title: 'A global vision, a strategic approach',
      lead: 'CTB Finances is a Dubai-based company dedicated to offering private clients and businesses a strategic, discreet and globally connected financial approach.',
      body: 'From one of the most dynamic business hubs in the world, we work to understand each objective in depth and build tailored paths, with the seriousness and care that financial decisions demand.',
      image: 'Leather notebook with the CTB Finances gold emblem and a fountain pen',
    },
    areas: {
      eyebrow: 'Our areas of expertise',
      title: 'Solutions designed for every stage',
      items: [
        { icon: 'estruturacao', title: 'Bank Brokerage', text: 'Bringing clients and banking institutions together, facilitating the relationship and the identification of alternatives suited to different financial needs.' },
        { icon: 'visao', title: 'Credit Review', text: 'Support in reviewing financial information and documentation related to credit operations, contributing to more organised and transparent assessment processes.' },
        { icon: 'consultoria', title: 'Financing Brokerage', text: 'Support in identifying and brokering financing opportunities, connecting client needs with potential financing institutions.' },
      ],
      note: 'CTB Finances acts as an intermediary and is not a banking institution. The availability of each service is subject to prior assessment.',
      more: 'Explore our solutions',
    },
    vision: {
      eyebrow: 'Vision for the future',
      title: 'Innovation with an international outlook',
      text: 'We follow the transformations of the financial market with an eye on the future, combining technology, relationships and the strength of Dubai.',
      button: 'Discover CTB Finances',
    },
    dubai: {
      eyebrow: 'Dubai',
      title: 'Dubai as a strategic hub',
      lead: 'Between East and West, Dubai has become a meeting point for companies, investors and families from around the world.',
      body: 'Its privileged location, world-class infrastructure and cosmopolitan environment make the city a natural base for those who think about business on an international scale. It is from here that CTB Finances looks out to the world.',
      image: 'Corporate lounge with a golden globe, armchair and a view of the Burj Khalifa in Dubai',
    },
    philosophy: {
      eyebrow: 'Our relationship philosophy',
      title: 'Relationships built on trust',
      items: [
        { icon: 'discricao', title: 'Discretion', text: 'Every piece of information is treated with the confidentiality and respect it deserves.' },
        { icon: 'relacionamento', title: 'Transparency', text: 'Clear communication at every step, for decisions made with confidence.' },
        { icon: 'visao', title: 'Strategic vision', text: 'A long-term perspective, aligned with each client’s objectives.' },
        { icon: 'atendimento', title: 'Personalised service', text: 'Every relationship is unique — and closely, attentively accompanied.' },
      ],
    },
    cta: {
      eyebrow: 'Contact',
      title: 'Your next step begins with a conversation.',
      text: 'Tell us about your goals. Our team will get back to you with care and discretion.',
      button: 'Contact us',
      href: '/en/contact/',
    },
  },
} satisfies Record<Lang, unknown>;
