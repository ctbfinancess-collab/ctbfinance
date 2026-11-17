/** E-mails de acesso da Área do Cliente (convite e redefinição de senha), na moldura visual aprovada. */
import { sendEmail, brandedHtml, fromAddress } from '../email-base.mjs';

export async function enviarEmailAcesso({ to, finalidade, lang, link, horas }) {
  const en = lang === 'en';
  const convite = finalidade === 'convite';
  const titulo = convite ? (en ? 'Your Client Area access' : 'Seu acesso à Área do Cliente') : (en ? 'Reset your password' : 'Redefinir sua senha');
  const validade = en ? (horas >= 24 ? `${horas / 24} days` : `${horas} hour`) : (horas >= 24 ? `${horas / 24} dias` : `${horas} hora`);
  const paragrafos = convite
    ? (en ? ['Your access to the CTB Finances Client Area has been created.', `To activate it, create your password using the button below. The link is valid for ${validade} and can be used only once.`]
          : ['Seu acesso à Área do Cliente da CTB Finances foi criado.', `Para ativá-lo, crie sua senha pelo botão abaixo. O link vale por ${validade} e só pode ser usado uma vez.`])
    : (en ? ['We received a request to reset the password of your Client Area account.', `If it was you, use the button below. The link is valid for ${validade} and can be used only once. If you did not request it, ignore this email — your password stays the same.`]
          : ['Recebemos um pedido para redefinir a senha da sua conta na Área do Cliente.', `Se foi você, use o botão abaixo. O link vale por ${validade} e só pode ser usado uma vez. Se não foi você, ignore este e-mail — sua senha continua a mesma.`]);
  const botao = { href: link, label: convite ? (en ? 'Create password' : 'Criar senha') : (en ? 'Reset password' : 'Redefinir senha') };
  const ok = await sendEmail({
    from: fromAddress(), to: [to], subject: `${titulo} · CTB Finances`,
    html: brandedHtml(lang, titulo, paragrafos, botao),
    text: `${titulo}\n\n${paragrafos.join('\n\n')}\n\n${botao.label}: ${link}\n\nCTB Finance Broker L.L.C. · Dubai`,
  }, `acesso-${finalidade}`);
  if (!ok) throw new Error('falha ao enviar e-mail de acesso');
}
