import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../../modules/audit/audit.service';
import { AuditAction } from '../../modules/audit/entities/audit-log.entity';

export const AUDIT_KEY = 'audit_action';
export const AUDIT_SKIP_KEY = 'audit_skip';

/**
 * Mappe les méthodes HTTP vers les actions d'audit.
 */
function mapHttpMethodToAction(method: string): AuditAction {
  switch (method.toUpperCase()) {
    case 'POST':
      return AuditAction.CREATE;
    case 'PATCH':
    case 'PUT':
      return AuditAction.UPDATE;
    case 'DELETE':
      return AuditAction.DELETE;
    case 'GET':
      return AuditAction.READ;
    default:
      return AuditAction.READ;
  }
}

/**
 * Détermine le type d'entité à partir de l'URL.
 * Ex: /api/v1/users/123 -> 'User'
 */
function extractEntityType(url: string): string {
  const segments = url.split('/').filter(Boolean);
  // Après le prefix 'api/v1', le premier segment est le nom du module
  const moduleIndex = segments.findIndex((s) => s === 'v1');
  if (moduleIndex >= 0 && moduleIndex + 1 < segments.length) {
    const entity = segments[moduleIndex + 1];
    // Capitaliser la première lettre et enlever le 's' final pluriel
    const singular = entity.endsWith('s') ? entity.slice(0, -1) : entity;
    return singular.charAt(0).toUpperCase() + singular.slice(1);
  }
  return 'Unknown';
}

/**
 * Intercepteur d'audit automatique.
 * Enregistre automatiquement chaque opération CRUD dans la table audit_logs.
 * Inspiré du pattern efarmOS (AutoAuditInterceptor).
 *
 * Peut être désactivé par le décorateur @AuditSkip() sur une méthode.
 * Peut être surchargé par le décorateur @Audit(action) pour forcer l'action.
 */
@Injectable()
export class AutoAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AutoAuditInterceptor.name);

  // Chemins exclus de l'audit (health, docs, etc.)
  private readonly excludedPaths = ['/health', '/docs', '/api-docs'];

  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    const controller = context.getClass();

    // Vérifier si l'audit est désactivé pour cette méthode
    const skipAudit = this.reflector.getAllAndOverride<boolean>(
      AUDIT_SKIP_KEY,
      [handler, controller],
    );
    if (skipAudit) {
      return next.handle();
    }

    // Exclure certains chemins
    if (this.excludedPaths.some((path) => request.url.includes(path))) {
      return next.handle();
    }

    const startTime = Date.now();
    const entityType = extractEntityType(request.url);
    const action =
      this.reflector.getAllAndOverride<AuditAction>(AUDIT_KEY, [
        handler,
        controller,
      ]) ?? mapHttpMethodToAction(request.method);

    return next.handle().pipe(
      tap({
        next: () => {
          this.logAudit(request, entityType, action, startTime, undefined);
        },
        error: (error: unknown) => {
          this.logAudit(request, entityType, action, startTime, error);
        },
      }),
    );
  }

  private logAudit(
    request: Request,
    entityType: string,
    action: AuditAction,
    startTime: number,
    error: unknown,
  ): void {
    const user = (
      request as Request & { user?: { id?: string; email?: string } }
    ).user;
    const duration = Date.now() - startTime;

    // Extraire l'ID de l'entité depuis l'URL (dernier segment si c'est un UUID)
    const segments = request.url.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    const entityId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        lastSegment,
      )
        ? lastSegment
        : undefined;

    this.auditService
      .log({
        userId: user?.id,
        userEmail: user?.email,
        entityType,
        entityId,
        action,
        description: error
          ? `${action} failed after ${duration}ms: ${error instanceof Error ? error.message : String(error)}`
          : `${action} completed in ${duration}ms`,
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
        metadata: {
          method: request.method,
          url: request.url,
          statusCode: error ? 500 : undefined,
          duration,
        },
      })
      .catch((err) => {
        this.logger.error('Échec écriture audit log', err);
      });
  }
}
