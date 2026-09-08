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
  USER_ROLES_UPDATED: 'Rôles de l\'utilisateur mis à jour avec succès.',

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

  // Génériques
  VALIDATION_ERROR: 'Certaines données sont invalides.',
  RESOURCE_NOT_FOUND: 'Ressource introuvable.',
  ACCESS_DENIED:
    'Vous n\'avez pas les permissions nécessaires pour effectuer cette action.',
  INTERNAL_SERVER_ERROR:
    'Une erreur interne est survenue. Veuillez réessayer plus tard.',
  NO_CHANGE: 'Aucune modification n\'a été détectée.',
  CONFLICT: 'Un conflit est survenu avec les données existantes.',
};
