import { SetMetadata } from '@nestjs/common';

export const NO_TENANT_KEY = 'noTenant';

/**
 * Décorateur pour désactiver la vérification tenant sur une route.
 * Utile pour les endpoints qui ne sont pas liés à un tenant spécifique
 * (ex: /tenants, /health, /docs).
 */
export const NoTenant = () => SetMetadata(NO_TENANT_KEY, true);
