export interface InvitationHtmlInput {
  recipientName: string;
  activationUrl: string;
  expiresAt: Date;
  resend?: boolean;
}

/**
 * Template HTML de l'invitation. Aucun mot de passe ni token brut n'est
 * inscrit : seul le lien d'activation (qui contient le token) est transmis
 * au destinataire par email.
 */
export function buildInvitationHtml(input: InvitationHtmlInput): string {
  const label = input.resend ? 'Nouvelle invitation' : 'Invitation';
  const intro = input.resend
    ? `Vous recevez une nouvelle invitation pour activer votre compte TransCI. Le lien précédent n'est plus valable.`
    : `Un compte TransCI a été créé pour vous. Pour finaliser votre activation et définir votre mot de passe, cliquez sur le bouton ci-dessous.`;
  const expiresText = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(input.expiresAt);

  const safeName = input.recipientName.replace(/[<>&"']/g, '');
  const safeUrl = input.activationUrl.replace(/[<>&"']/g, '');

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;font-size:15px;color:#1f2933;">
          <tr>
            <td style="background:#0f766e;padding:24px 32px;">
              <span style="color:#ffffff;font-size:22px;font-weight:bold;">TransCI – ${label}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p>Bonjour ${safeName},</p>
              <p>${intro}</p>
              <p style="text-align:center;margin:28px 0;">
                <a href="${safeUrl}" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;">
                  Activer mon compte
                </a>
              </p>
              <p style="font-size:13px;color:#626e7e;">
                Ce lien expire le <strong>${expiresText}</strong>.
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:
              </p>
              <p style="font-size:13px;word-break:break-all;background:#f0f4f8;padding:12px;border-radius:6px;">
                ${safeUrl}
              </p>
              <p style="font-size:13px;color:#626e7e;">
                Si vous n'êtes pas à l'origine de cette invitation, vous pouvez ignorer cet email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
