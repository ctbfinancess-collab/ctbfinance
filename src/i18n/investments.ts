/**
 * Página "Investimentos" — conteúdo EXCLUSIVAMENTE informativo e educacional.
 * A CTB Finances não comercializa produtos de investimento, não faz recomendação
 * nem gestão de recursos. Manter o aviso legal visível.
 */
import type { Lang } from './ui';

export const investments = {
  pt: {
    meta: {
      title: 'Investimentos · CTB Finances Dubai',
      description: 'Conteúdo informativo sobre mercados financeiros, classes de ativos e os fundamentos de uma decisão consciente.',
    },
    banner: {
      crumb: 'Investimentos',
      eyebrow: 'Investimentos',
      title: 'Uma visão estratégica sobre o universo dos investimentos',
      lead: 'Inteligência para decisões financeiras.',
    },
    intro: {
      eyebrow: 'Compreendendo o cenário financeiro',
      lead: [
        'Em um ambiente econômico em constante transformação, compreender os mercados financeiros é essencial para avaliar oportunidades e reconhecer riscos.',
        'A CTB Finances valoriza o conhecimento, a transparência e a análise criteriosa como fundamentos para decisões financeiras responsáveis.',
      ],
      title: 'Compreendendo os mercados',
      body: [
        'Os mercados financeiros reúnem diferentes instrumentos, instituições e oportunidades. Cada classe de ativos apresenta características próprias, incluindo níveis distintos de risco, liquidez e horizonte de investimento.',
        'A compreensão dessas diferenças contribui para uma visão mais ampla e consciente do cenário econômico.',
      ],
      image: 'Painéis translúcidos com gráficos financeiros e mapa-múndi em tons dourados',
    },
    fundamentals: {
      eyebrow: 'Fundamentos',
      title: 'Os fundamentos de uma decisão consciente',
      items: [
        { icon: 'visao', title: 'Objetivos financeiros', text: 'Toda decisão começa pela definição de prioridades, necessidades e expectativas.' },
        { icon: 'horizonte', title: 'Horizonte de tempo', text: 'O prazo previsto para utilização dos recursos influencia a avaliação de alternativas financeiras.' },
        { icon: 'discricao', title: 'Avaliação de riscos', text: 'Compreender as possibilidades de perda, volatilidade e liquidez é parte essencial de qualquer análise.' },
        { icon: 'diversificacao', title: 'Diversificação', text: 'A distribuição de recursos entre diferentes ativos pode contribuir para a gestão de determinados riscos, sem eliminá-los.' },
      ],
    },
    assets: {
      eyebrow: 'Conteúdo informativo',
      title: 'Conheça diferentes classes de ativos',
      items: [
        { title: 'Renda fixa', text: 'Instrumentos em que as condições de remuneração são definidas no momento da aplicação, como títulos públicos e privados.' },
        { title: 'Participações empresariais', text: 'Participação no capital de empresas, cujo resultado acompanha o desempenho e a valorização do negócio.' },
        { title: 'Ativos reais', text: 'Bens com existência física, como imóveis e commodities, cujo valor depende de fatores econômicos e de mercado.' },
        { title: 'Ativos digitais', text: 'Ativos registrados em meio digital, geralmente sujeitos a alta volatilidade e a regras que variam conforme a jurisdição.' },
      ],
      image: 'Barras de ouro, moedas, gráfico em alta, edifícios e campo agrícola em miniatura, representando diferentes classes de ativos',
      note: 'Conteúdo de caráter educativo. A CTB Finances não comercializa, distribui ou recomenda esses produtos.',
    },
    risks: {
      eyebrow: 'Riscos, transparência e responsabilidade',
      title: 'Conhecimento e responsabilidade',
      body: [
        'Acreditamos que informação clara e compreensão dos riscos são fundamentais para o relacionamento com o mercado financeiro.',
        'Por isso, valorizamos a transparência, o respeito às normas aplicáveis e a importância de decisões fundamentadas em informações verificáveis.',
      ],
      items: [
        { title: 'Risco de mercado', text: 'Possibilidade de perdas em razão de oscilações de preços, taxas e condições econômicas.' },
        { title: 'Liquidez', text: 'Facilidade, ou dificuldade, de converter um ativo em recursos disponíveis sem perda relevante de valor.' },
        { title: 'Volatilidade', text: 'Intensidade das variações de preço de um ativo ao longo do tempo.' },
      ],
      verify: 'Antes de investir, verifique se a instituição está devidamente autorizada pelos órgãos reguladores competentes da sua jurisdição.',
    },
    solutions: {
      eyebrow: 'Conheça a CTB Finances',
      title: 'Conhecimento para decisões mais conscientes.',
      body: [
        'A CTB Finances valoriza a transparência, a análise criteriosa e o relacionamento responsável. Conheça nossas áreas de atuação em intermediação bancária, análise de crédito e intermediação de financiamentos.',
      ],
      cardTitle: 'Nossas áreas de atuação',
      areas: ['Intermediação Bancária', 'Análise de Crédito', 'Intermediação de Financiamentos'],
      primary: 'Conheça nossas soluções',
      secondary: 'Fale conosco',
    },
    disclaimer: 'O conteúdo desta página tem caráter exclusivamente informativo e educacional. Não constitui recomendação de investimento, oferta de valores mobiliários ou serviço de gestão de recursos.',
  },
  en: {
    meta: {
      title: 'Investments · CTB Finances Dubai',
      description: 'Informational content on financial markets, asset classes and the fundamentals of an informed decision.',
    },
    banner: {
      crumb: 'Investments',
      eyebrow: 'Investments',
      title: 'A strategic view of the world of investments',
      lead: 'Insight for financial decisions.',
    },
    intro: {
      eyebrow: 'Understanding the financial landscape',
      lead: [
        'In a constantly changing economic environment, understanding financial markets is essential to assess opportunities and recognise risks.',
        'CTB Finances values knowledge, transparency and careful analysis as the foundations of responsible financial decisions.',
      ],
      title: 'Understanding the markets',
      body: [
        'Financial markets bring together different instruments, institutions and opportunities. Each asset class has its own characteristics, including different levels of risk, liquidity and investment horizon.',
        'Understanding these differences contributes to a broader, more informed view of the economic landscape.',
      ],
      image: 'Translucent panels showing financial charts and a world map in golden tones',
    },
    fundamentals: {
      eyebrow: 'Fundamentals',
      title: 'The fundamentals of an informed decision',
      items: [
        { icon: 'visao', title: 'Financial goals', text: 'Every decision starts by defining priorities, needs and expectations.' },
        { icon: 'horizonte', title: 'Time horizon', text: 'The expected timeframe for using the funds influences how financial alternatives are assessed.' },
        { icon: 'discricao', title: 'Risk assessment', text: 'Understanding the possibility of loss, volatility and liquidity is an essential part of any analysis.' },
        { icon: 'diversificacao', title: 'Diversification', text: 'Spreading resources across different assets may help manage certain risks, without eliminating them.' },
      ],
    },
    assets: {
      eyebrow: 'Informational content',
      title: 'Explore different asset classes',
      items: [
        { title: 'Fixed income', text: 'Instruments whose return conditions are set at the time of investment, such as government and corporate bonds.' },
        { title: 'Equity holdings', text: 'Ownership stakes in companies, whose results follow the performance and growth of the business.' },
        { title: 'Real assets', text: 'Physical assets such as real estate and commodities, whose value depends on economic and market factors.' },
        { title: 'Digital assets', text: 'Assets recorded in digital form, generally subject to high volatility and to rules that vary by jurisdiction.' },
      ],
      image: 'Gold bars, coins, a rising chart, miniature buildings and farmland, representing different asset classes',
      note: 'Educational content. CTB Finances does not sell, distribute or recommend these products.',
    },
    risks: {
      eyebrow: 'Risk, transparency and responsibility',
      title: 'Knowledge and responsibility',
      body: [
        'We believe that clear information and an understanding of risk are fundamental to any relationship with the financial market.',
        'That is why we value transparency, respect for applicable rules and decisions grounded in verifiable information.',
      ],
      items: [
        { title: 'Market risk', text: 'The possibility of losses due to changes in prices, rates and economic conditions.' },
        { title: 'Liquidity', text: 'How easily — or not — an asset can be converted into available funds without a significant loss of value.' },
        { title: 'Volatility', text: 'The intensity of an asset’s price movements over time.' },
      ],
      verify: 'Before investing, check that the institution is duly authorised by the competent regulators in your jurisdiction.',
    },
    solutions: {
      eyebrow: 'Meet CTB Finances',
      title: 'Knowledge for more informed decisions.',
      body: [
        'CTB Finances values transparency, careful analysis and responsible relationships. Explore our areas of activity in bank brokerage, credit review and financing brokerage.',
      ],
      cardTitle: 'Our areas of activity',
      areas: ['Bank Brokerage', 'Credit Review', 'Financing Brokerage'],
      primary: 'Explore our solutions',
      secondary: 'Contact us',
    },
    disclaimer: 'The content of this page is for information and educational purposes only. It does not constitute investment advice, an offer of securities or an asset management service.',
  },
} satisfies Record<Lang, unknown>;
