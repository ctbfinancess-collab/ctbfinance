/** Envio de e-mails (Resend) e moldura visual aprovada — compartilhado pelo site e pela Área do Cliente. */
export const SITE = 'https://ctbfinances.ae';
export const RESEND_API = process.env.RESEND_API_BASE || 'https://api.resend.com'; // trocável só para testes locais
export const fromAddress = () => process.env.CONTACT_EMAIL_FROM || 'CTB Finances – Site <site@ctbfinances.ae>';
export const teamList = () => String(process.env.CONTACT_EMAIL_TO || '').split(',').map((x) => x.trim()).filter(Boolean);
export const replyToTeam = () => process.env.CONTACT_REPLY_TO || teamList()[0];

export async function sendEmail(payload, label) {
  if (process.env.CONTACT_DRY_RUN === '1') { console.log(`[email] DRY_RUN — ${label} validado, não enviado.`); return true; }
  try {
    const r = await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) { console.error(`[email] ${label}: Resend respondeu`, r.status); return false; }
    console.log(`[email] ${label} enviado`);
    return true;
  } catch {
    console.error(`[email] ${label}: falha de rede ao chamar o Resend`);
    return false;
  }
}

/** Moldura visual dos e-mails da CTB Finances (arte aprovada: águia + CTB FINANCES + DUBAI, pergaminho,
 *  robô com Dubai e onda dourada). PT/EN pelo parâmetro lang. Layout em tabelas (Gmail, Outlook, Apple Mail,
 *  Hostinger). Imagens servidas em /email/. Sem dados enviados pelo visitante no corpo (evita uso indevido). */
export function brandedHtml(lang, title, paragraphs, button) {
  const en = lang === 'en';
  const IMG = `${SITE}/email`;
  const serif = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  const text = "Georgia, 'Times New Roman', serif";
  const PAPER = '#F7EBDB';
  const GOLD = '#C9A46A';
  const rule = (w) => `<td width="${w}" style="width:${w}px;vertical-align:middle"><div style="height:1px;line-height:1px;font-size:0;background:${GOLD}">&nbsp;</div></td>`;
  const btn = button ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0"><tr>
<td align="center" bgcolor="#C69B69" style="border-radius:999px;background:#C69B69;background-image:linear-gradient(180deg,#F3D9A4 0%,#D9AE6B 38%,#B9853F 70%,#9C6A2E 100%);box-shadow:0 10px 22px rgba(53,36,29,0.28);border:1px solid #8E5F2A">
<a href="${button.href}" style="display:inline-block;padding:13px 38px;font-family:${serif};font-size:20px;font-weight:600;color:#2A140D;text-decoration:none;border-radius:999px">${button.label}</a>
</td></tr></table>` : '';
  // itens: texto (vira parágrafo) ou { html } (bloco pronto, ex.: tabela de dados)
  const body = paragraphs.map((x) => (typeof x === 'object' ? x.html : `<p style="margin:0 0 9px;font-family:${text};font-size:16px;line-height:1.4;color:#35241D">${x}</p>`)).join('');
  return `<!doctype html><html lang="${en ? 'en' : 'pt-BR'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet">
<style>@media (max-width:620px){.side{display:none!important}.main{padding:20px 22px 0!important}.ttl{font-size:28px!important}.fl{padding-top:22px!important}}</style></head>
<body style="margin:0;padding:0;background:#E9DCC8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E9DCC8"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${PAPER}">
  <tr><td style="font-size:0;line-height:0"><a href="${SITE}"><img src="${IMG}/ctb-email-topo.jpg" width="600" alt="CTB Finances Dubai" style="display:block;width:100%;height:auto;border:0"></a></td></tr>
  <tr><td style="padding:0 1.9%">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:1px solid ${GOLD};border-right:1px solid ${GOLD}">
      <tr>
        <td class="main" valign="top" style="padding:20px 6px 0 30px">
          <h1 class="ttl" style="margin:0;font-family:${serif};font-weight:600;font-size:34px;line-height:1.12;color:#4A2A1C">${title}</h1>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 14px"><tr>
            ${rule(120)}
            <td style="padding:0 7px;font-size:10px;line-height:10px;color:#B58B4D;vertical-align:middle">&#9670;</td>
            ${rule(120)}
          </tr></table>
          ${body}${btn}
        </td>
        <td class="side" valign="top" width="185" style="width:185px;padding:6px 0 0;font-size:0;line-height:0"><img src="${IMG}/ctb-email-lateral.jpg" width="185" alt="" style="display:block;width:185px;height:auto;border:0"></td>
      </tr>
      <tr><td colspan="2" class="fl" style="padding:6px 24px 0"><div style="border-top:1px solid ${GOLD};font-size:0;line-height:0">&nbsp;</div></td></tr>
      <tr><td colspan="2" align="center" style="padding:9px 20px 0">
        <p style="margin:0;font-family:${serif};font-size:14px;font-weight:600;letter-spacing:3px;color:#35241D">CTB FINANCE BROKER L.L.C.</p>
        <p style="margin:2px 0 6px;font-family:${text};font-size:12px;letter-spacing:1px;color:#4A2A1C">${en ? 'Dubai, United Arab Emirates' : 'Dubai, Emirados Árabes Unidos'}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>
          ${rule(110)}
          <td style="padding:0 10px;font-family:${text};font-size:14px;white-space:nowrap;vertical-align:middle"><a href="${SITE}" style="color:#35241D;text-decoration:none"><img src="${IMG}/globo.png" width="13" height="13" alt="" style="vertical-align:-2px;border:0">&nbsp;ctbfinances.ae</a></td>
          ${rule(110)}
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="font-size:0;line-height:0"><img src="${IMG}/ctb-email-onda.jpg" width="600" alt="" style="display:block;width:100%;height:auto;border:0"></td></tr>
</table>
</td></tr></table>
</body></html>`;
}

