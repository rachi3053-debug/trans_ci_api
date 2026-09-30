import { MessageCode } from './message.codes';

/**
 * Messages FR centralisés par code technique.
 * Source de vérité unique des textes renvoyés au client.
 */
export const MESSAGES: Record<MessageCode, string> = {
  // Auth
  AUTH_LOGIN_SUCCESS: 'Connexion réussie.',
  AUTH_INVALID_CREDENTIALS: 'Les identifiants sont incorrects.',
  AUTH_UNAUTHORIZED:
    'Vous devez être authentifié pour accéder à cette ressource.',
  AUTH_TOKEN_EXPIRED: 'Votre session a expiré. Veuillez vous reconnecter.',
  AUTH_REFRESH_INVALID: 'Le jeton de rafraîchissement est invalide ou expiré.',
  AUTH_REGISTERED: 'Inscription réussie.',

  // Users
  USER_CREATED: 'Utilisateur créé avec succès.',
  USER_UPDATED: 'Utilisateur modifié avec succès.',
  USER_DELETED: 'Utilisateur supprimé avec succès.',
  USER_NOT_FOUND: 'Utilisateur introuvable.',
  USER_ALREADY_EXISTS: 'Un utilisateur avec cet email existe déjà.',
  USER_ALREADY_INACTIVE: 'Cet utilisateur est déjà désactivé.',
  USER_DISABLED: 'Cet utilisateur est actuellement désactivé.',
  USER_LIST: 'Liste des utilisateurs récupérée avec succès.',
  USER_ROLES_UPDATED: "Rôles de l'utilisateur mis à jour avec succès.",
  USER_RESTORED: 'Utilisateur restauré avec succès.',
  USER_HARD_DELETED: 'Utilisateur supprimé définitivement.',
  USER_PASSWORD_UPDATED: 'Mot de passe mis à jour avec succès.',
  USER_ACCESS_LOCKED: 'Compte utilisateur bloqué avec succès.',
  USER_ACCESS_UNLOCKED: 'Compte utilisateur débloqué avec succès.',
  USER_ACCESS_HISTORY_LIST:
    'Historique des blocages/déblocages récupéré avec succès.',
  USERS_BULK_UPDATED: 'Opération en masse effectuée avec succès.',
  USERS_BULK_DELETED: 'Utilisateurs supprimés avec succès.',
  USERS_BULK_RESTORED: 'Utilisateurs restaurés avec succès.',
  USERS_NOT_SELECTED: 'Aucun utilisateur sélectionné.',
  CONFIRMATION_REQUIRED:
    'Cette opération en masse nécessite une confirmation explicite.',

  // Invitation / activation de compte
  USER_INVITED: 'Utilisateur créé. Une invitation lui a été envoyée par email.',
  USER_NOT_ACTIVATED:
    "Ce compte n'est pas encore activé. Activez-le via le lien envoyé par email.",
  USER_NOT_INVITED:
    "Ce compte n'a pas de mot de passe en attente : il n'est pas en statut invité.",
  USER_ALREADY_ACTIVATED: 'Ce compte est déjà activé.',
  USER_ACCOUNT_ACTIVATED:
    'Compte activé avec succès. Vous pouvez maintenant vous connecter.',
  INVITATION_VALIDATED: 'Invitation valide.',
  INVITATION_INVALID_OR_EXPIRED:
    "Ce lien d'invitation est invalide ou a expiré.",
  INVITATION_TOO_FRESH:
    'Une invitation a déjà été envoyée très récemment. Réessayez dans quelques instants.',
  INVITATION_RESENT: 'Invitation renvoyée avec succès.',

  // Roles
  ROLE_CREATED: 'Rôle créé avec succès.',
  ROLE_UPDATED: 'Rôle modifié avec succès.',
  ROLE_DELETED: 'Rôle supprimé avec succès.',
  ROLE_NOT_FOUND: 'Rôle introuvable.',
  ROLE_ALREADY_EXISTS: 'Un rôle avec ce code existe déjà.',
  ROLE_LIST: 'Liste des rôles récupérée avec succès.',
  ROLE_PERMISSIONS_UPDATED: 'Permissions du rôle mises à jour avec succès.',

  // Permissions
  PERMISSION_CREATED: 'Permission créée avec succès.',
  PERMISSION_UPDATED: 'Permission modifiée avec succès.',
  PERMISSION_DELETED: 'Permission supprimée avec succès.',
  PERMISSION_NOT_FOUND: 'Permission introuvable.',
  PERMISSION_ALREADY_EXISTS: 'Une permission avec ce code existe déjà.',
  PERMISSION_LIST: 'Liste des permissions récupérée avec succès.',

  // API Keys
  API_KEY_CREATED: 'Clé API créée avec succès.',
  API_KEY_REVOKED: 'Clé API révoquée avec succès.',
  API_KEY_NOT_FOUND: 'Clé API introuvable.',
  API_KEY_LIST: 'Liste des clés API récupérée avec succès.',

  // Audit
  AUDIT_LOG_CREATED: "Journal d'audit enregistré avec succès.",
  AUDIT_LOG_LIST: "Liste des journaux d'audit récupérée avec succès.",
  AUDIT_LOG_NOT_FOUND: "Journal d'audit introuvable.",

  // Pagination
  PAGINATION_LIST: 'Liste paginée récupérée avec succès.',

  // Génériques
  VALIDATION_ERROR: 'Certaines données sont invalides.',
  RESOURCE_NOT_FOUND: 'Ressource introuvable.',
  ACCESS_DENIED:
    "Vous n'avez pas les permissions nécessaires pour effectuer cette action.",
  INTERNAL_SERVER_ERROR:
    'Une erreur interne est survenue. Veuillez réessayer plus tard.',
  REQUEST_TIMEOUT: 'La requête a pris trop de temps. Veuillez réessayer.',
  NO_CHANGE: "Aucune modification n'a été détectée.",
  CONFLICT: 'Un conflit est survenu avec les données existantes.',

  // Mot de passe
  PASSWORD_MISMATCH: 'Les mots de passe ne correspondent pas.',
  PASSWORD_RESET_REQUESTED:
    "Si un compte existe pour cet email, un lien de réinitialisation vient d'être envoyé.",
  PASSWORD_RESET_COMPLETED:
    'Votre mot de passe a été réinitialisé. Vous pouvez vous connecter.',
  PASSWORD_RESET_INVALID_OR_EXPIRED:
    'Ce lien de réinitialisation est invalide ou a expiré. Refaites une demande.',

  // Stockage (Supabase Storage)
  FILE_UPLOADED: 'Fichier téléversé avec succès.',
  FILE_DOWNLOADED: 'Fichier téléchargé avec succès.',
  FILE_DELETED: 'Fichier supprimé avec succès.',
  FILE_NOT_FOUND: 'Fichier introuvable.',
  FILE_TYPE_NOT_ALLOWED: 'Le type de fichier n est pas autorisé.',
  FILE_TOO_LARGE: 'Le fichier dépasse la taille maximale autorisée.',
  FILE_UPLOAD_ERROR: 'Erreur lors du téléversement du fichier.',
  FILE_DOWNLOAD_ERROR: 'Erreur lors du téléchargement du fichier.',
  FILE_DELETE_ERROR: 'Erreur lors de la suppression du fichier.',
};
