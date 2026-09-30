import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../../modules/audit/entities/audit-log.entity';
import {
  AUDIT_KEY,
  AUDIT_SKIP_KEY,
} from '../interceptors/auto-audit.interceptor';

/**
 * Décorateur pour forcer l'action d'audit sur une méthode de contrôleur.
 * Ex: @Audit(AuditAction.LOGIN) sur la méthode login()
 */
export const Audit = (action: AuditAction) => SetMetadata(AUDIT_KEY, action);

/**
 * Décorateur pour désactiver l'audit automatique sur une méthode de contrôleur.
 * Ex: @AuditSkip() sur GET /health
 */
export const AuditSkip = () => SetMetadata(AUDIT_SKIP_KEY, true);
