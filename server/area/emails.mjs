/** E-mails de acesso da Área do Cliente (convite e redefinição de senha), na moldura visual aprovada. */
import { sendEmail, brandedHtml, fromAddress, teamList } from '../email-base.mjs';

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

const ASSUNTOS_PT = { abertura_conta: 'Abertura de conta', investimentos: 'Investimentos', documentos: 'Documentos', outro: 'Outro assunto' };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Aviso INTERNO à equipe (CONTACT_EMAIL_TO): um cliente pediu agendamento pela Área do Cliente. */
const FORMATOS_PT = { video: 'Vídeo', presencial: 'Presencial' };
const PERIODOS_PT = { manha: 'Manhã (9h–12h, Dubai)', tarde: 'Tarde (13h–18h, Dubai)', qualquer: 'Qualquer horário' };
export async function avisarEquipeAgendamento({ email, nome, assunto, data, formato, periodo, observacao }) {
  const para = teamList(); if (!para.length) return;
  const [a, m, d] = data.split('-');
  const linhas = [['Cliente', nome || '—'], ['E-mail', email], ['Assunto', ASSUNTOS_PT[assunto] || assunto], ['Data desejada', `${d}/${m}/${a}`], ['Formato', FORMATOS_PT[formato] || '—'], ['Melhor horário', PERIODOS_PT[periodo] || '—'], ['Observação', observacao || '—']];
  const tabela = { html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 10px;font-family:Georgia,serif;font-size:15px;color:#35241D">${linhas.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#7a5a45;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:3px 0;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}</table>` };
  const ok = await sendEmail({
    from: fromAddress(), to: para, reply_to: email, subject: `Pedido de agendamento · ${nome || email}`,
    html: brandedHtml('pt', 'Pedido de agendamento', ['Um cliente pediu um agendamento pela Área do Cliente:', tabela, 'Para confirmar o horário (horário de Dubai), use o comando agenda:confirmar. O cliente vê a confirmação na Área do Cliente.']),
    text: `Pedido de agendamento (Área do Cliente)\n\n${linhas.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nConfirme o horário com agenda:confirmar.`,
  }, 'aviso-agendamento');
  if (!ok) throw new Error('falha ao enviar aviso de agendamento');
}
