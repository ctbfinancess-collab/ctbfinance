/**
 * Políticas institucionais — RASCUNHO para revisão jurídica.
 * Não publicar sem aprovação de advogado(a) com atuação nos Emirados Árabes Unidos.
 * Campos entre colchetes [ ] precisam ser preenchidos/confirmados.
 */
import type { Lang } from './ui';

type Section = { h: string; p: string[] };
type Doc = { title: string; eyebrow: string; lead: string; updated: string; sections: Section[] };

const ENTITY = 'CTB FINANCE BROKER L.L.C.';
const LICENSE = '717060';

export const legalCommon = {
  pt: { updatedLabel: 'Última atualização', draft: 'Documento em revisão. Este texto é uma versão preliminar e pode ser alterado.', nav: 'Políticas', privacy: 'Política de Privacidade', terms: 'Termos de Uso', legal: 'Aviso Legal' },
  en: { updatedLabel: 'Last updated', draft: 'Document under review. This text is a preliminary version and may change.', nav: 'Policies', privacy: 'Privacy Policy', terms: 'Terms of Use', legal: 'Legal Notice' },
};

export const legal: Record<'privacy' | 'terms' | 'legal', Record<Lang, Doc>> = {
  privacy: {
    pt: {
      eyebrow: 'Políticas', title: 'Política de Privacidade', updated: '16 de novembro de 2026',
      lead: 'Como a CTB Finances coleta, utiliza e protege as informações pessoais compartilhadas por meio deste site.',
      sections: [
        { h: '1. Quem somos', p: [`Este site é mantido pela ${ENTITY}, empresa registrada em Dubai, Emirados Árabes Unidos, sob a licença comercial nº ${LICENSE}, emitida pelo Dubai Department of Economy and Tourism (DET). Nesta política, "CTB Finances", "nós" e "nosso" referem-se a essa empresa.`] },
        { h: '2. Informações que coletamos', p: ['Coletamos apenas as informações que você nos fornece voluntariamente ao entrar em contato, como nome completo, endereço de e-mail, número de telefone, assunto e o conteúdo da sua mensagem.', 'Este site não utiliza cookies de publicidade nem ferramentas de rastreamento de terceiros. Caso isso venha a mudar, esta política será atualizada.'] },
        { h: '3. Como utilizamos as informações', p: ['As informações recebidas são utilizadas exclusivamente para responder ao seu contato, prestar esclarecimentos sobre nossas áreas de atuação e manter o registro da comunicação.', 'Não vendemos, alugamos nem comercializamos dados pessoais.'] },
        { h: '4. Base para o tratamento', p: ['Tratamos as informações com base no seu consentimento, manifestado ao enviar o formulário de contato, e no nosso interesse legítimo em responder às solicitações recebidas, observada a legislação aplicável, incluindo a legislação de proteção de dados dos Emirados Árabes Unidos.'] },
        { h: '5. Compartilhamento', p: ['As informações podem ser compartilhadas apenas com prestadores de serviço necessários ao funcionamento do site e ao recebimento das mensagens (por exemplo, serviços de hospedagem e de envio de formulários), que estão obrigados a tratá-las com confidencialidade.', 'Também poderemos compartilhar informações quando exigido por lei ou por autoridade competente.'] },
        { h: '6. Transferência internacional', p: ['Alguns prestadores de serviço podem armazenar dados fora dos Emirados Árabes Unidos. Nesses casos, buscamos utilizar fornecedores que adotem medidas adequadas de proteção.'] },
        { h: '7. Armazenamento e segurança', p: ['Mantemos as informações pelo tempo necessário para atender à finalidade do contato e às obrigações legais aplicáveis, adotando medidas razoáveis para protegê-las contra acesso não autorizado, perda ou alteração.'] },
        { h: '8. Seus direitos', p: ['Você pode solicitar acesso, correção ou exclusão das suas informações pessoais, bem como retirar o seu consentimento a qualquer momento, entrando em contato conosco pelos canais indicados abaixo.'] },
        { h: '9. Contato', p: ['Para assuntos relacionados a esta política, entre em contato pelo e-mail contact@ctb.ae, pelo telefone +971 58 882 1694 ou pela página Contato deste site.'] },
        { h: '10. Alterações', p: ['Esta política pode ser atualizada periodicamente. A data da última atualização está indicada no início deste documento.'] },
      ],
    },
    en: {
      eyebrow: 'Policies', title: 'Privacy Policy', updated: '16 November 2026',
      lead: 'How CTB Finances collects, uses and protects the personal information shared through this website.',
      sections: [
        { h: '1. Who we are', p: [`This website is operated by ${ENTITY}, a company registered in Dubai, United Arab Emirates, under trade licence no. ${LICENSE}, issued by the Dubai Department of Economy and Tourism (DET). In this policy, "CTB Finances", "we" and "our" refer to that company.`] },
        { h: '2. Information we collect', p: ['We only collect the information you voluntarily provide when contacting us, such as your full name, email address, phone number, subject and the content of your message.', 'This website does not use advertising cookies or third-party tracking tools. Should this change, this policy will be updated.'] },
        { h: '3. How we use information', p: ['The information received is used solely to respond to your enquiry, provide information about our areas of activity and keep a record of the communication.', 'We do not sell, rent or trade personal data.'] },
        { h: '4. Basis for processing', p: ['We process information on the basis of your consent, given when you submit the contact form, and our legitimate interest in responding to enquiries, in accordance with applicable law, including the data protection legislation of the United Arab Emirates.'] },
        { h: '5. Sharing', p: ['Information may only be shared with service providers required to operate the website and receive messages (for example, hosting and form-delivery services), who are bound to keep it confidential.', 'We may also share information where required by law or by a competent authority.'] },
        { h: '6. International transfers', p: ['Some service providers may store data outside the United Arab Emirates. In such cases, we seek to use providers that apply appropriate safeguards.'] },
        { h: '7. Retention and security', p: ['We keep information for as long as necessary to fulfil the purpose of the enquiry and applicable legal obligations, and take reasonable measures to protect it against unauthorised access, loss or alteration.'] },
        { h: '8. Your rights', p: ['You may request access to, correction or deletion of your personal information, and withdraw your consent at any time, by contacting us through the channels below.'] },
        { h: '9. Contact', p: ['For matters relating to this policy, please email contact@ctb.ae, call +971 58 882 1694 or use the Contact page of this website.'] },
        { h: '10. Changes', p: ['This policy may be updated from time to time. The date of the latest update is shown at the top of this document.'] },
      ],
    },
  },
  terms: {
    pt: {
      eyebrow: 'Políticas', title: 'Termos de Uso', updated: '16 de novembro de 2026',
      lead: 'Condições para a utilização deste site institucional.',
      sections: [
        { h: '1. Aceitação', p: [`Ao acessar este site, mantido pela ${ENTITY}, você concorda com estes Termos de Uso. Caso não concorde, recomendamos não utilizar o site.`] },
        { h: '2. Finalidade do site', p: ['Este site tem caráter exclusivamente institucional e informativo. Seu objetivo é apresentar a empresa, suas áreas de atuação e seus canais de contato.', 'Nenhum conteúdo deste site constitui oferta, proposta, recomendação ou contratação de serviços. Qualquer relação comercial depende de análise prévia e de instrumento próprio.'] },
        { h: '3. Uso adequado', p: ['O usuário compromete-se a utilizar o site de forma lícita, sem praticar atos que possam prejudicar seu funcionamento, sua segurança ou terceiros, e a fornecer informações verdadeiras ao entrar em contato.'] },
        { h: '4. Propriedade intelectual', p: ['Textos, imagens, marcas, logotipos e demais elementos deste site pertencem à CTB Finances ou a seus licenciadores e não podem ser reproduzidos, alterados ou utilizados sem autorização prévia por escrito.'] },
        { h: '5. Links para outros sites', p: ['Este site pode conter links para sites de terceiros, incluindo empresas e instituições relacionadas ao Grupo CTB. Não nos responsabilizamos pelo conteúdo ou pelas práticas desses sites.'] },
        { h: '6. Limitação de responsabilidade', p: ['Empregamos esforços razoáveis para manter as informações atualizadas e corretas, mas não garantimos que o conteúdo esteja livre de erros ou omissões. A CTB Finances não se responsabiliza por decisões tomadas com base exclusivamente nas informações deste site.'] },
        { h: '7. Alterações', p: ['Estes Termos podem ser alterados a qualquer momento. A versão vigente é sempre a publicada nesta página.'] },
        { h: '8. Legislação aplicável', p: ['Estes Termos são regidos pelas leis do Emirado de Dubai e pelas leis federais dos Emirados Árabes Unidos aplicáveis. [Foro a confirmar com assessoria jurídica.]'] },
      ],
    },
    en: {
      eyebrow: 'Policies', title: 'Terms of Use', updated: '16 November 2026',
      lead: 'Conditions for using this institutional website.',
      sections: [
        { h: '1. Acceptance', p: [`By accessing this website, operated by ${ENTITY}, you agree to these Terms of Use. If you do not agree, we recommend that you do not use the website.`] },
        { h: '2. Purpose of the website', p: ['This website is purely institutional and informational. Its purpose is to present the company, its areas of activity and its contact channels.', 'No content on this website constitutes an offer, proposal, recommendation or engagement of services. Any business relationship is subject to prior assessment and a specific agreement.'] },
        { h: '3. Appropriate use', p: ['Users agree to use the website lawfully, without engaging in any act that may harm its operation, its security or third parties, and to provide truthful information when contacting us.'] },
        { h: '4. Intellectual property', p: ['Texts, images, trademarks, logos and other elements of this website belong to CTB Finances or its licensors and may not be reproduced, altered or used without prior written authorisation.'] },
        { h: '5. Links to other websites', p: ['This website may contain links to third-party websites, including companies and institutions related to the CTB Group. We are not responsible for the content or practices of those websites.'] },
        { h: '6. Limitation of liability', p: ['We make reasonable efforts to keep information accurate and up to date, but do not guarantee that the content is free from errors or omissions. CTB Finances is not responsible for decisions made solely on the basis of information on this website.'] },
        { h: '7. Changes', p: ['These Terms may be changed at any time. The version in force is always the one published on this page.'] },
        { h: '8. Governing law', p: ['These Terms are governed by the laws of the Emirate of Dubai and the applicable federal laws of the United Arab Emirates. [Jurisdiction to be confirmed with legal counsel.]'] },
      ],
    },
  },
  legal: {
    pt: {
      eyebrow: 'Políticas', title: 'Aviso Legal', updated: '16 de novembro de 2026',
      lead: 'Informações importantes sobre a natureza da empresa e do conteúdo deste site.',
      sections: [
        { h: '1. Identificação', p: [`${ENTITY} · Licença comercial nº ${LICENSE} · Emitida pelo Dubai Department of Economy and Tourism (DET) · Dubai, Emirados Árabes Unidos.`] },
        { h: '2. Atividades registradas', p: ['As atividades constantes da licença comercial da empresa são: Intermediação Bancária (Bank Brokers), Análise de Crédito (Credit Review Services) e Intermediação de Financiamentos (Financing Broker).'] },
        { h: '3. Registro comercial e autorizações', p: ['O registro comercial identifica as atividades que a empresa pode exercer comercialmente e não equivale, por si só, a autorização para atividades financeiras reguladas. Informações sobre autorizações regulatórias específicas serão divulgadas somente após verificação documental.'] },
        { h: '4. Natureza da atuação', p: ['A CTB Finances atua como intermediária e não é uma instituição bancária. A empresa não concede crédito ou financiamento diretamente, não capta recursos do público e não realiza gestão de recursos de terceiros. A aprovação de qualquer operação depende exclusivamente da análise e dos critérios de cada instituição financeira.'] },
        { h: '5. Conteúdo informativo', p: ['O conteúdo da página Investimentos e demais materiais deste site têm caráter exclusivamente informativo e educacional. Não constituem recomendação de investimento, oferta de valores mobiliários, oferta de produtos financeiros ou serviço de gestão de recursos.', 'Antes de tomar qualquer decisão financeira, recomendamos buscar orientação profissional independente e verificar se a instituição envolvida está devidamente autorizada pelos órgãos reguladores competentes.'] },
        { h: '6. Grupo CTB', p: ['A apresentação das empresas e instituições do Grupo CTB tem caráter institucional e não representa organograma societário, participações ou relações de controle. Cada empresa possui personalidade jurídica e atividades próprias.'] },
      ],
    },
    en: {
      eyebrow: 'Policies', title: 'Legal Notice', updated: '16 November 2026',
      lead: 'Important information about the nature of the company and of the content of this website.',
      sections: [
        { h: '1. Identification', p: [`${ENTITY} · Trade licence no. ${LICENSE} · Issued by the Dubai Department of Economy and Tourism (DET) · Dubai, United Arab Emirates.`] },
        { h: '2. Registered activities', p: ['The activities listed in the company’s commercial licence are: Bank Brokerage (Bank Brokers), Credit Review (Credit Review Services) and Financing Brokerage (Financing Broker).'] },
        { h: '3. Commercial registration and authorisations', p: ['Commercial registration identifies the activities the company may carry out commercially and does not, in itself, amount to authorisation for regulated financial activities. Information on specific regulatory authorisations will only be published after documentary verification.'] },
        { h: '4. Nature of activities', p: ['CTB Finances acts as an intermediary and is not a banking institution. The company does not grant credit or financing directly, does not take deposits from the public and does not manage third-party funds. The approval of any operation depends exclusively on the assessment and criteria of each financial institution.'] },
        { h: '5. Informational content', p: ['The content of the Investments page and other materials on this website is for information and educational purposes only. It does not constitute investment advice, an offer of securities, an offer of financial products or an asset management service.', 'Before making any financial decision, we recommend seeking independent professional advice and checking that the institution involved is duly authorised by the competent regulators.'] },
        { h: '6. CTB Group', p: ['The presentation of the CTB Group’s companies and institutions is institutional in nature and does not represent a corporate chart, shareholdings or control relationships. Each company has its own legal personality and activities.'] },
      ],
    },
  },
};
