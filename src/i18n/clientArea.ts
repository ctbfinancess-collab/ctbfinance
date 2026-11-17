/**
 * Página institucional da Área do Cliente.
 * Login DESATIVADO até a auditoria do Firebase. Não exibir saldos, contas,
 * cartões, transferências nem qualquer funcionalidade fictícia.
 */
import type { Lang } from './ui';

export const clientArea = {
  pt: {
    meta: { title: 'Área do Cliente · CTB Finances Dubai', description: 'Um ambiente reservado para acompanhar seu relacionamento com a CTB Finances.' },
    banner: {
      crumb: 'Área do Cliente',
      // frase sobre o vídeo — provisória, aguardando a frase final
      caption: 'O futuro não tem fronteiras. Suas possibilidades também não.',
      eyebrow: 'Área do Cliente',
      title: 'Bem-vindo à sua área exclusiva.',
      lead: 'Um ambiente reservado para acompanhar seu relacionamento com a CTB Finances.',
    },
    access: {
      eyebrow: 'Acesso',
      title: 'Entrar',
      email: 'E-mail',
      password: 'Senha',
      submit: 'Entrar',
      forgot: 'Esqueci minha senha',
      status: 'Acesso em preparação. Em breve, nossos clientes poderão entrar por aqui com segurança.',
      notClient: 'Ainda não é cliente?',
      notClientLink: 'Seja nosso cliente',
    },
    intro: {
      eyebrow: 'Portal privado',
      title: 'Um espaço pensado para a continuidade do seu relacionamento',
      paragraphs: [
        'A Área do Cliente está sendo preparada para reunir, em um só ambiente, as informações e o acompanhamento do seu relacionamento com a CTB Finances.',
        'O acesso será liberado de forma gradual, com cada funcionalidade disponibilizada somente após estar plenamente implementada, testada e protegida.',
      ],
    },
    features: {
      eyebrow: 'O que você encontrará',
      title: 'Relacionamento, acompanhamento e atendimento',
      items: [
        { title: 'Relacionamento', text: 'Seus dados cadastrais organizados e atualizados em um ambiente reservado.' },
        { title: 'Acompanhamento de solicitações', text: 'Visão clara das etapas de cada solicitação apresentada à nossa equipe.' },
        { title: 'Atendimento personalizado', text: 'Comunicação direta com a equipe responsável pelo seu relacionamento.' },
        { title: 'Segurança', text: 'Acesso protegido e canal adequado para o envio de documentos, quando necessário.' },
      ],
      note: 'As funcionalidades serão disponibilizadas gradualmente.',
    },
    security: {
      eyebrow: 'Segurança e privacidade',
      title: 'Confidencialidade em primeiro lugar',
      text: 'O portal está sendo estruturado com atenção à proteção das informações, ao controle de acesso e à confidencialidade que orientam todas as relações da CTB Finances.',
      privacyLink: 'Conheça nossa Política de Privacidade',
    },
    cta: {
      title: 'Precisa falar com nossa equipe agora?',
      text: 'Enquanto o acesso é preparado, estamos à disposição pelos canais de atendimento.',
      contact: 'Fale conosco',
      client: 'Seja nosso cliente',
    },
  },
  en: {
    meta: { title: 'Client Area · CTB Finances Dubai', description: 'A private environment to follow your relationship with CTB Finances.' },
    banner: {
      crumb: 'Client Area',
      caption: 'The future knows no boundaries. Neither do your possibilities.',
      eyebrow: 'Client Area',
      title: 'Welcome to your exclusive area.',
      lead: 'A private environment to follow your relationship with CTB Finances.',
    },
    access: {
      eyebrow: 'Access',
      title: 'Sign in',
      email: 'Email',
      password: 'Password',
      submit: 'Sign in',
      forgot: 'Forgot my password',
      status: 'Access in preparation. Our clients will soon be able to sign in here securely.',
      notClient: 'Not a client yet?',
      notClientLink: 'Become a client',
    },
    intro: {
      eyebrow: 'Private portal',
      title: 'A space designed for the continuity of your relationship',
      paragraphs: [
        'The Client Area is being prepared to bring together, in a single environment, the information and follow-up of your relationship with CTB Finances.',
        'Access will be released gradually, with each feature made available only once it is fully implemented, tested and protected.',
      ],
    },
    features: {
      eyebrow: 'What you will find',
      title: 'Relationship, follow-up and service',
      items: [
        { title: 'Relationship', text: 'Your registration details organised and up to date in a private environment.' },
        { title: 'Request follow-up', text: 'A clear view of the stages of each request submitted to our team.' },
        { title: 'Personalised service', text: 'Direct communication with the team responsible for your relationship.' },
        { title: 'Security', text: 'Protected access and an appropriate channel for sending documents, when needed.' },
      ],
      note: 'Features will be made available gradually.',
    },
    security: {
      eyebrow: 'Security and privacy',
      title: 'Confidentiality first',
      text: 'The portal is being built with attention to information protection, access control and the confidentiality that guides every CTB Finances relationship.',
      privacyLink: 'Read our Privacy Policy',
    },
    cta: {
      title: 'Need to speak with our team now?',
      text: 'While access is being prepared, we are available through our service channels.',
      contact: 'Contact us',
      client: 'Become a client',
    },
  },
} satisfies Record<Lang, unknown>;
