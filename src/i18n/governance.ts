/**
 * Página "Governança".
 * REGRAS: não inventar licenças, certificações, políticas internas ou autorizações.
 * Não afirmar procedimentos de compliance, AML/KYC ou auditoria sem documento.
 * Registro comercial ≠ autorização para atividade financeira regulada.
 * Campos "pending: true" aparecem como "A confirmar" até virem dos documentos.
 */
import type { Lang } from './ui';

export const governance = {
  pt: {
    meta: {
      title: 'Governança · CTB Finances Dubai',
      description: 'Princípios, conformidade, privacidade e estrutura institucional da CTB Finances.',
    },
    banner: {
      crumb: 'Governança',
      eyebrow: 'Governança',
      title: 'Governança e Integridade',
      lead: 'Transparência, conformidade e responsabilidade como base de cada relação.',
    },
    principles: {
      eyebrow: 'Nossos princípios',
      title: 'Os valores que orientam a nossa atuação',
      text: 'Ética, integridade, transparência, responsabilidade e respeito às normas aplicáveis sustentam cada relação que construímos.',
      image: 'Balança dourada sobre mesa de mármore, com livros encadernados e o emblema da águia da CTB Finances ao fundo',
      items: [
        { icon: 'estruturacao', title: 'Ética', text: 'Conduta pautada pelo respeito, pela honestidade e pela boa-fé em todas as relações.' },
        { icon: 'relacionamento', title: 'Transparência', text: 'Comunicação clara sobre o nosso papel, as etapas de cada processo e suas condições.' },
        { icon: 'discricao', title: 'Integridade', text: 'Coerência entre o que dizemos e o que fazemos, em cada decisão.' },
        { icon: 'consultoria', title: 'Responsabilidade', text: 'Compromisso com decisões fundamentadas e com o respeito às normas aplicáveis.' },
      ],
    },
    compliance: {
      eyebrow: 'Conformidade e responsabilidade regulatória',
      title: 'Clareza sobre quem somos e o que fazemos',
      intro: 'As atividades abaixo constam da licença comercial da empresa. O registro comercial identifica as atividades que a empresa pode exercer comercialmente e não equivale, por si só, a autorização para atividades financeiras reguladas.',
      activitiesTitle: 'Atividades da licença comercial',
      activities: [
        { pt: 'Intermediação Bancária', license: 'Bank Brokers' },
        { pt: 'Análise de Crédito', license: 'Credit Review Services' },
        { pt: 'Intermediação de Financiamentos', license: 'Financing Broker' },
      ],
      entityTitle: 'Identificação da entidade',
      entity: [
        { label: 'Razão social', value: 'CTB FINANCE BROKER L.L.C.', pending: false },
        { label: 'Jurisdição', value: 'Dubai, Emirados Árabes Unidos', pending: false },
        { label: 'Número da licença comercial', value: '717060', pending: false },
        { label: 'Autoridade emissora', value: 'Dubai Department of Economy and Tourism (DET)', pending: false },
      ],
      pendingLabel: 'A confirmar',
      regulatory: 'Informações sobre autorizações regulatórias específicas serão publicadas somente após verificação documental.',
    },
    privacy: {
      eyebrow: 'Privacidade e proteção de informações',
      title: 'Confidencialidade em cada etapa',
      items: [
        { title: 'Confidencialidade', text: 'Informações compartilhadas pelos clientes são tratadas com sigilo e discrição.' },
        { title: 'Tratamento responsável de dados', text: 'Os dados são utilizados apenas para a finalidade combinada com o cliente.' },
        { title: 'Segurança das informações', text: 'Compromisso com o cuidado no armazenamento e no acesso às informações.' },
      ],
    },
    group: {
      eyebrow: 'Grupo CTB',
      title: 'Nosso Grupo Empresarial',
      lead: 'A CTB Finances integra o Grupo CTB, presente no Reino Unido, nos Emirados Árabes Unidos, em Omã e no Brasil, com empresas de identidade e atuação próprias.',
      holding: { name: 'CTB Holdings', logo: 'ctb-holdings', location: 'Londres, Reino Unido', text: 'Holding internacional dedicada ao desenvolvimento de negócios, investimentos de longo prazo e conexões estratégicas entre mercados globais.', website: 'https://ctbholdings.uk' },
      companiesLabel: 'Empresas do grupo',
      companies: [
        { name: 'CTB Finances', logo: 'ctb-finances', location: 'Dubai, Emirados Árabes Unidos', text: 'Empresa sediada em Dubai, dedicada ao desenvolvimento de soluções e oportunidades no setor financeiro, observadas as autorizações regulatórias aplicáveis.', self: true },
        { name: 'CTB Venture', logo: 'ctb-venture', location: 'Brasil', text: 'Atuação no desenvolvimento de oportunidades empresariais, estruturação de negócios e iniciativas de investimento.', website: 'https://ctbventure.com/' },
        { name: 'CTBX Payments', logo: 'ctbx-payments', location: 'Brasil', text: 'Empresa voltada à tecnologia financeira, infraestrutura e soluções de pagamentos, conforme suas atividades efetivamente autorizadas.' },
        { name: 'Oman Brazil', logo: 'oman-brazil', tile: true, location: 'Omã', text: 'Empresa sediada em Omã, voltada ao desenvolvimento de negócios e à conexão de oportunidades comerciais internacionais.', website: 'https://www.omanbrazil.com/' },
      ],
      institutionLabel: 'Instituições e relações institucionais',
      institutions: [
        { name: 'Fundação Wahibi', logo: 'fundacao-wahibi', kind: 'Instituição vinculada', location: 'Brasil · Fundação', text: 'Organização dedicada à inovação, ao desenvolvimento e a iniciativas de impacto social.', website: 'https://fundacaowahibi.org/' },
        { name: 'Câmara de Comércio Brasil–Omã', logo: 'camara-brasil-oma', kind: 'Relação institucional', location: 'Brasil · Omã', text: 'Instituição dedicada a fortalecer os laços comerciais, culturais e institucionais entre o Brasil e o Sultanato de Omã.', website: 'https://www.brasilomanchamber.org/' },
      ],
      selfLabel: 'Você está aqui',
      visit: 'Visitar site',
      note: 'Apresentação institucional do grupo. Não representa organograma societário, participações ou relações de controle.',
    },
    leadership: {
      eyebrow: 'Sócios da CTB Finances',
      title: 'Liderança do Grupo CTB',
      people: [
        { name: 'Mazin Ali Khalfan Al Wahibi', role: 'Sócio da CTB Finances · Grupo CTB', photo: '/people/mazin-al-wahibi.jpg', position: '50% 18%', bio: [
          'Mazin Ali Khalfan Al Wahibi é um empresário omanense com trajetória voltada às relações internacionais, ao desenvolvimento de negócios e à construção de conexões estratégicas entre diferentes mercados.',
          'Graduado em Relações Internacionais pelo Centro Universitário de Brasília (UniCEUB), desenvolveu experiência em comércio exterior, negociações internacionais, gestão de fornecedores e identificação de oportunidades empresariais na América Latina, Europa, Ásia e países do Conselho de Cooperação do Golfo.',
          'Sua atuação abrange as empresas e organizações que integram o ecossistema do Grupo CTB, incluindo a CTB Holdings, no Reino Unido, a CTB Finances, em Dubai, e as operações empresariais e iniciativas institucionais desenvolvidas no Brasil.',
          'Também exerce a presidência da Câmara de Comércio Brasil–Omã, contribuindo para o fortalecimento das relações comerciais e institucionais entre os dois países.',
          'Sua trajetória é marcada pela visão internacional, pelo desenvolvimento de relacionamentos estratégicos e pelo compromisso com a expansão responsável das atividades do grupo.',
        ] },
        { name: 'Tarik Muhamad Ali', role: 'Sócio da CTB Finances · Grupo CTB', photo: '/people/tarik-muhamad-ali.jpg', position: '50% 30%', bio: [
          'Tarik Muhamad Ali é um empresário brasileiro, administrador de empresas, com atuação na estruturação, administração e desenvolvimento de negócios, participando das atividades empresariais e institucionais do Grupo CTB.',
          'Sua experiência está relacionada à organização de operações, à gestão empresarial e ao desenvolvimento de estruturas voltadas à atuação em diferentes mercados.',
          'Integra a estrutura de negócios do grupo, que reúne a CTB Holdings, no Reino Unido, a CTB Finances, em Dubai, e empresas e iniciativas institucionais no Brasil.',
          'Sua participação também se estende às organizações vinculadas ao ecossistema CTB, contribuindo para a integração das atividades empresariais, o relacionamento institucional e o desenvolvimento de projetos.',
          'Sua trajetória destaca uma visão voltada à organização, à continuidade dos negócios e à construção de relacionamentos profissionais de longo prazo.',
        ] },
      ],
      bioToggle: 'Conheça a trajetória',
      photoLabel: 'Fotografia oficial (em breve)',
    },
    cta: {
      title: 'Ficou com alguma dúvida sobre a nossa atuação?',
      text: 'Nossa equipe está à disposição para esclarecer informações institucionais.',
      button: 'Fale conosco',
    },
  },
  en: {
    meta: {
      title: 'Governance · CTB Finances Dubai',
      description: 'Principles, compliance, privacy and institutional structure of CTB Finances.',
    },
    banner: {
      crumb: 'Governance',
      eyebrow: 'Governance',
      title: 'Governance and Integrity',
      lead: 'Transparency, compliance and responsibility as the foundation of every relationship.',
    },
    principles: {
      eyebrow: 'Our principles',
      title: 'The values that guide our work',
      text: 'Ethics, integrity, transparency, responsibility and respect for applicable rules underpin every relationship we build.',
      image: 'A golden scale on a marble desk, with bound books and the CTB Finances eagle emblem in the background',
      items: [
        { icon: 'estruturacao', title: 'Ethics', text: 'Conduct grounded in respect, honesty and good faith in every relationship.' },
        { icon: 'relacionamento', title: 'Transparency', text: 'Clear communication about our role, the stages of each process and its conditions.' },
        { icon: 'discricao', title: 'Integrity', text: 'Consistency between what we say and what we do, in every decision.' },
        { icon: 'consultoria', title: 'Responsibility', text: 'A commitment to well-founded decisions and to respecting applicable rules.' },
      ],
    },
    compliance: {
      eyebrow: 'Compliance and regulatory responsibility',
      title: 'Clarity about who we are and what we do',
      intro: 'The activities below are listed in the company’s commercial licence. Commercial registration identifies the activities the company may carry out commercially and does not, in itself, amount to authorisation for regulated financial activities.',
      activitiesTitle: 'Commercial licence activities',
      activities: [
        { pt: 'Bank Brokerage', license: 'Bank Brokers' },
        { pt: 'Credit Review', license: 'Credit Review Services' },
        { pt: 'Financing Brokerage', license: 'Financing Broker' },
      ],
      entityTitle: 'Entity details',
      entity: [
        { label: 'Legal name', value: 'CTB FINANCE BROKER L.L.C.', pending: false },
        { label: 'Jurisdiction', value: 'Dubai, United Arab Emirates', pending: false },
        { label: 'Commercial licence number', value: '717060', pending: false },
        { label: 'Issuing authority', value: 'Dubai Department of Economy and Tourism (DET)', pending: false },
      ],
      pendingLabel: 'To be confirmed',
      regulatory: 'Information on specific regulatory authorisations will only be published after documentary verification.',
    },
    privacy: {
      eyebrow: 'Privacy and information protection',
      title: 'Confidentiality at every stage',
      items: [
        { title: 'Confidentiality', text: 'Information shared by clients is handled with confidentiality and discretion.' },
        { title: 'Responsible data handling', text: 'Data is used only for the purpose agreed with the client.' },
        { title: 'Information security', text: 'A commitment to care in how information is stored and accessed.' },
      ],
    },
    group: {
      eyebrow: 'CTB Group',
      title: 'Our Business Group',
      lead: 'CTB Finances is part of the CTB Group, present in the United Kingdom, the United Arab Emirates, Oman and Brazil, with companies that each have their own identity and activities.',
      holding: { name: 'CTB Holdings', logo: 'ctb-holdings', location: 'London, United Kingdom', text: 'International holding company dedicated to business development, long-term investments and strategic connections between global markets.', website: 'https://ctbholdings.uk' },
      companiesLabel: 'Group companies',
      companies: [
        { name: 'CTB Finances', logo: 'ctb-finances', location: 'Dubai, United Arab Emirates', text: 'Dubai-based company dedicated to developing solutions and opportunities in the financial sector, in compliance with the applicable regulatory authorisations.', self: true },
        { name: 'CTB Venture', logo: 'ctb-venture', location: 'Brazil', text: 'Focused on developing business opportunities, structuring ventures and investment initiatives.', website: 'https://ctbventure.com/' },
        { name: 'CTBX Payments', logo: 'ctbx-payments', location: 'Brazil', text: 'Company focused on financial technology, infrastructure and payment solutions, in accordance with its duly authorised activities.' },
        { name: 'Oman Brazil', logo: 'oman-brazil', tile: true, location: 'Oman', text: 'Oman-based company focused on business development and on connecting international trade opportunities.', website: 'https://www.omanbrazil.com/' },
      ],
      institutionLabel: 'Institutions and institutional relationships',
      institutions: [
        { name: 'Fundação Wahibi', logo: 'fundacao-wahibi', kind: 'Affiliated institution', location: 'Brazil · Foundation', text: 'Organisation dedicated to innovation, development and social impact initiatives.', website: 'https://fundacaowahibi.org/' },
        { name: 'Brazil–Oman Chamber of Commerce', logo: 'camara-brasil-oma', kind: 'Institutional relationship', location: 'Brazil · Oman', text: 'An institution dedicated to strengthening trade, cultural and institutional ties between Brazil and the Sultanate of Oman.', website: 'https://www.brasilomanchamber.org/' },
      ],
      selfLabel: 'You are here',
      visit: 'Visit website',
      note: 'Institutional presentation of the group. It does not represent a corporate chart, shareholdings or control relationships.',
    },
    leadership: {
      eyebrow: 'CTB Finances Partners',
      title: 'CTB Group Leadership',
      people: [
        { name: 'Mazin Ali Khalfan Al Wahibi', role: 'Partner, CTB Finances · CTB Group', photo: '/people/mazin-al-wahibi.jpg', position: '50% 18%', bio: [
          'Mazin Ali Khalfan Al Wahibi is an Omani entrepreneur whose career has focused on international relations, business development and building strategic connections between different markets.',
          'A graduate in International Relations from the University Centre of Brasília (UniCEUB), he developed experience in foreign trade, international negotiations, supplier management and identifying business opportunities in Latin America, Europe, Asia and the Gulf Cooperation Council countries.',
          'His work spans the companies and organisations that make up the CTB Group ecosystem, including CTB Holdings in the United Kingdom, CTB Finances in Dubai, and the business operations and institutional initiatives developed in Brazil.',
          'He also serves as President of the Brazil–Oman Chamber of Commerce, contributing to stronger trade and institutional relations between the two countries.',
          'His career is marked by an international outlook, the development of strategic relationships and a commitment to the responsible expansion of the group’s activities.',
        ] },
        { name: 'Tarik Muhamad Ali', role: 'Partner, CTB Finances · CTB Group', photo: '/people/tarik-muhamad-ali.jpg', position: '50% 30%', bio: [
          'Tarik Muhamad Ali is a Brazilian entrepreneur and business administrator working in business structuring, administration and development, taking part in the CTB Group’s business and institutional activities.',
          'His experience relates to organising operations, business management and developing structures for operating in different markets.',
          'He is part of the group’s business structure, which brings together CTB Holdings in the United Kingdom, CTB Finances in Dubai, and companies and institutional initiatives in Brazil.',
          'His involvement also extends to the organisations linked to the CTB ecosystem, contributing to the integration of business activities, institutional relationships and project development.',
          'His career reflects a focus on organisation, business continuity and building long-term professional relationships.',
        ] },
      ],
      bioToggle: 'Read biography',
      photoLabel: 'Official photograph (coming soon)',
    },
    cta: {
      title: 'Any questions about how we work?',
      text: 'Our team is available to clarify institutional information.',
      button: 'Contact us',
    },
  },
} satisfies Record<Lang, unknown>;
