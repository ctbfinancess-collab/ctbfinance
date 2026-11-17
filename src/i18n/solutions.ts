/**
 * Página "Soluções" — atividades da licença comercial (confirmadas pela empresa).
 * IMPORTANTE: o registro comercial não comprova autorização regulatória adicional.
 * Não afirmar que a empresa é banco, concede empréstimos ou oferece investimentos,
 * criptoativos, cartões ou gestão de recursos.
 */
import type { Lang } from './ui';

export const solutions = {
  pt: {
    meta: {
      title: 'Soluções · CTB Finances Dubai',
      description: 'Intermediação bancária, análise de crédito e intermediação de financiamentos, a partir de Dubai.',
    },
    banner: {
      crumb: 'Soluções',
      eyebrow: 'Nossas soluções',
      title: 'Soluções pensadas para cada etapa.',
      lead: 'Intermediação bancária, análise de crédito e intermediação de financiamentos, com transparência, segurança e visão internacional.',
    },
    areas: {
      eyebrow: 'Áreas de atuação',
      title: 'Três frentes, um mesmo compromisso',
      items: [
        { icon: 'estruturacao', image: 'sol-bancaria-v2', alt: 'Miniatura dourada de edifício com colunas clássicas sobre mesa de mármore, com caneta-tinteiro e pasta de couro', title: 'Intermediação Bancária', license: 'Bank Brokers', text: 'Aproximação entre clientes e instituições bancárias, facilitando o relacionamento e a identificação de alternativas compatíveis com diferentes necessidades financeiras.' },
        { icon: 'visao', image: 'sol-credito-v2', alt: 'Lupa dourada sobre relatórios financeiros, com livros, ampulheta e calculadora em mesa de mármore', title: 'Análise de Crédito', license: 'Credit Review Services', text: 'Apoio à avaliação de informações financeiras e documentação relacionada a operações de crédito, contribuindo para processos de análise mais organizados e transparentes.' },
        { icon: 'consultoria', image: 'sol-financiamento-v2', alt: 'Prancheta com caneta-tinteiro ao lado de pilhas de moedas douradas e gráfico de crescimento', title: 'Intermediação de Financiamentos', license: 'Financing Broker', text: 'Apoio na identificação e intermediação de oportunidades de financiamento, conectando necessidades de clientes a possíveis instituições financiadoras.' },
      ],
    },
    process: {
      eyebrow: 'Como trabalhamos',
      title: 'Um processo claro, do primeiro contato ao acompanhamento',
      steps: [
        { title: 'Entender', text: 'Ouvimos seus objetivos, seu contexto e suas prioridades.' },
        { title: 'Analisar', text: 'Organizamos as informações e avaliamos as alternativas possíveis.' },
        { title: 'Conectar', text: 'Aproximamos você das instituições mais adequadas ao seu caso.' },
        { title: 'Acompanhar', text: 'Seguimos ao seu lado, com comunicação clara em cada etapa.' },
      ],
    },
    trust: {
      eyebrow: 'Princípios',
      title: 'Transparência, confidencialidade e conformidade',
      items: [
        { title: 'Transparência', text: 'Informações claras sobre o nosso papel, as etapas do processo e o que depende de cada parte envolvida.' },
        { title: 'Confidencialidade', text: 'Dados e documentos dos clientes são tratados com sigilo e utilizados apenas para a finalidade combinada.' },
        { title: 'Conformidade', text: 'Atuamos com respeito às normas aplicáveis e às exigências das instituições com as quais nos relacionamos.' },
      ],
      disclaimer: 'A CTB Finances atua como intermediária e não é uma instituição bancária. Não concede crédito ou financiamento diretamente: a aprovação de qualquer operação depende exclusivamente da análise e dos critérios de cada instituição financeira.',
    },
    cta: {
      title: 'Vamos entender o que faz sentido para você.',
      text: 'Cada solução começa por uma conversa sobre seus objetivos e seu contexto.',
      button: 'Fale com um especialista',
    },
  },
  en: {
    meta: {
      title: 'Solutions · CTB Finances Dubai',
      description: 'Bank brokerage, credit review services and financing brokerage, from Dubai.',
    },
    banner: {
      crumb: 'Solutions',
      eyebrow: 'Our solutions',
      title: 'Solutions designed for every stage.',
      lead: 'Bank brokerage, credit review and financing brokerage, with transparency, security and an international outlook.',
    },
    areas: {
      eyebrow: 'Areas of activity',
      title: 'Three fronts, one commitment',
      items: [
        { icon: 'estruturacao', image: 'sol-bancaria-v2', alt: 'A golden miniature building with classical columns on a marble desk, with a fountain pen and leather folder', title: 'Bank Brokerage', license: 'Bank Brokers', text: 'Bringing clients and banking institutions together, facilitating the relationship and the identification of alternatives suited to different financial needs.' },
        { icon: 'visao', image: 'sol-credito-v2', alt: 'A golden magnifying glass over financial reports, with books, an hourglass and a calculator on a marble desk', title: 'Credit Review', license: 'Credit Review Services', text: 'Support in reviewing financial information and documentation related to credit operations, contributing to more organised and transparent assessment processes.' },
        { icon: 'consultoria', image: 'sol-financiamento-v2', alt: 'A clipboard with a fountain pen beside stacks of gold coins and a rising chart', title: 'Financing Brokerage', license: 'Financing Broker', text: 'Support in identifying and brokering financing opportunities, connecting client needs with potential financing institutions.' },
      ],
    },
    process: {
      eyebrow: 'How we work',
      title: 'A clear process, from first contact to ongoing support',
      steps: [
        { title: 'Understand', text: 'We listen to your goals, your context and your priorities.' },
        { title: 'Analyse', text: 'We organise the information and assess the possible alternatives.' },
        { title: 'Connect', text: 'We bring you closer to the institutions best suited to your case.' },
        { title: 'Accompany', text: 'We stay by your side, with clear communication at every stage.' },
      ],
    },
    trust: {
      eyebrow: 'Principles',
      title: 'Transparency, confidentiality and compliance',
      items: [
        { title: 'Transparency', text: 'Clear information about our role, the stages of the process and what depends on each party involved.' },
        { title: 'Confidentiality', text: 'Client data and documents are handled in confidence and used only for the agreed purpose.' },
        { title: 'Compliance', text: 'We act with respect for applicable rules and for the requirements of the institutions we work with.' },
      ],
      disclaimer: 'CTB Finances acts as an intermediary and is not a banking institution. It does not grant credit or financing directly: the approval of any operation depends exclusively on the assessment and criteria of each financial institution.',
    },
    cta: {
      title: 'Let’s understand what makes sense for you.',
      text: 'Every solution begins with a conversation about your goals and your context.',
      button: 'Speak with a specialist',
    },
  },
} satisfies Record<Lang, unknown>;
