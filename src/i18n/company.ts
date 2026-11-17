/** Dados institucionais da empresa (fonte: licença comercial de Dubai e material institucional). */
export const company = {
  legalName: 'CTB FINANCE BROKER L.L.C.',
  tradeLicense: '717060',
  phone: '+971 58 882 1694',
  phoneHref: 'tel:+971588821694',
  email: 'contact@ctb.ae',
  /** E-mail confirmado como ativo em 16/11/2026. */
  emailConfirmed: true,
  /**
   * Endpoint do formulário (servidor próprio em server.mjs, que envia pelo Resend).
   * Se as variáveis RESEND_API_KEY / CONTACT_EMAIL_TO não estiverem configuradas no Railway,
   * o servidor responde 503 e o site mostra a mensagem de indisponibilidade — nada é simulado.
   */
  formEndpoint: '/api/contact',
  /**
   * Endereços do aplicativo. Enquanto vazios:
   * - "Seja nosso cliente" leva para a página Contato;
   * - "Área do Cliente" leva à página institucional /area-do-cliente/ (login em preparação).
   */
  appLoginUrl: '',
  appSignupUrl: '',
};
