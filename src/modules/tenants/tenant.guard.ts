import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TenantService } from './tenant.service';
import { IS_PUBLIC_KEY } from '../auth/guards/public.decorator';
import { NO_TENANT_KEY } from './decorators/no-tenant.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Guard multi-tenant inspiré du pattern efarmOS.
 *
 * Valide que :
 * 1. Le tenant existe en base
 * 2. Le tenant est actif
 *
 * Les routes marquées @Public() ou @NoTenant() sont exemptées.
 * Le tenant est résolu via TenantContextService (header/JWT/sous-domaine/query).
 *
 * Note : ce guard est un APP_GUARD global. Il ne peut PAS injecter de
 * providers request-scoped (TenantContextService) dans le constructeur.
 * On utilise un service singleton pour résoudre le tenant à la volée.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantService: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      controller,
    ]);
    if (isPublic) return true;

    const noTenant = this.reflector.getAllAndOverride<boolean>(NO_TENANT_KEY, [
      handler,
      controller,
    ]);
    if (noTenant) return true;

    const request = context.switchToHttp().getRequest<Request>();

    // ROOT : accès global, le tenant n'est pas obligatoire
    const currentUser = request.user as AuthenticatedUser | undefined;
    if (currentUser?.isRoot === true) {
      return true;
    }

    // Résolution du tenant depuis les sources disponibles (même logique que TenantContextService)
    const tenantId = this.extractTenantId(request);
    const tenantCode = this.extractTenantCode(request);

    if (!tenantId && !tenantCode) {
      throw new UnauthorizedException(
        'Tenant requis. Envoyez X-Tenant-Id ou X-Tenant-Code dans les headers.',
      );
    }

    const tenant = tenantId
      ? await this.tenantService.findById(tenantId)
      : await this.tenantService.findByCode(tenantCode!);

    if (!tenant) {
      throw new UnauthorizedException('Tenant introuvable.');
    }

    if (!tenant.isActive) {
      throw new UnauthorizedException('Ce tenant est désactivé.');
    }

    // Attacher le tenant résolu à la requête pour TenantContextService
    (
      request as Request & { resolvedTenant?: { id: string; code: string } }
    ).resolvedTenant = {
      id: tenant.id,
      code: tenant.code,
    };

    return true;
  }

  private extractTenantId(request: Request): string | null {
    // 1. Header
    const headerId = request.headers['x-tenant-id'];
    if (headerId && typeof headerId === 'string') return headerId;

    // 2. JWT payload (user injecté par PassportStrategy)
    const user = request.user as Record<string, unknown> | undefined;
    if (user?.tenantId && typeof user.tenantId === 'string')
      return user.tenantId;

    // 3. Query param
    const queryTenantId = request.query?.tenantId;
    if (queryTenantId && typeof queryTenantId === 'string')
      return queryTenantId;

    return null;
  }

  private extractTenantCode(request: Request): string | null {
    // 1. Header
    const headerCode = request.headers['x-tenant-code'];
    if (headerCode && typeof headerCode === 'string') return headerCode;

    // 2. JWT payload
    const user = request.user as Record<string, unknown> | undefined;
    if (user?.tenantCode && typeof user.tenantCode === 'string')
      return user.tenantCode;

    // 3. Sous-domaine
    const host = request.get('host') ?? '';
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api')
      return subdomain;

    return null;
  }
}
