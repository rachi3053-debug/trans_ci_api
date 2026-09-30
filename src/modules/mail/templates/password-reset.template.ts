export interface PasswordResetHtmlInput {
  recipientName: string;
  resetUrl: string;
  expiresAt: Date;
}

/**
 * Template HTML de réinitialisation de mot de passe. Aucun token brut n'est
 * inscrit : seul le lien de réinitialisation (qui contient le token) est
 * transmis au destinataire par email.
 */
export function buildPasswordResetHtml(input: PasswordResetHtmlInput): string {
  const expiresText = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(input.expiresAt);

  const safeName = input.recipientName.replace(/[<>&"']/g, '');
  const safeUrl = input.resetUrl.replace(/[<>&"']/g, '');

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
              <span style="color:#ffffff;font-size:22px;font-weight:bold;">TransCI – Réinitialisation du mot de passe</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p>Bonjour ${safeName},</p>
              <p>
                Une demande de réinitialisation du mot de passe de votre compte TransCI
                vient d'être effectuée. Si vous n'êtes pas à l'origine de cette demande,
                ignorez cet email.
              </p>
              <p style="text-align:center;margin:28px 0;">
                <a href="${safeUrl}" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;">
                  Réinitialiser mon mot de passe
                </a>
              </p>
              <p style="font-size:13px;color:#626e7e;">
                Ce lien est valable jusqu'au <strong>${expiresText}</strong>.
                Passé ce délai, vous devrez refaire une demande.
              </p>
              <p style="font-size:13px;word-break:break-all;background:#f0f4f8;padding:12px;border-radius:6px;">
                ${safeUrl}
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
