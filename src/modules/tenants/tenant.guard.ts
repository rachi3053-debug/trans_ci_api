import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { IS_PUBLIC_KEY } from '../auth/guards/public.decorator';
import { NO_TENANT_KEY } from './decorators/no-tenant.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Origine de la valeur de tenant publiée dans `request.resolvedTenant`.
 * - `jwt` : tenant porté par le jeton d'accès de l'utilisateur (seule source
 *   admise pour un utilisateur non ROOT).
 * - `header` : tenant demandé explicitement par un ROOT via `X-Tenant-Id` /
 *   `X-Tenant-Code` (facultatif, le ROOT n'a pas de tenant imposé).
 */
export type TenantSource = 'jwt' | 'header';

/**
 * Tenant effectif de la requête, validé par le guard (existence + activation
 * contrôlées en base) et rattaché à la requête pour `TenantContextService`.
 */
export interface ResolvedTenant {
  id: string;
  code: string;
  source: TenantSource;
}

type RequestWithResolvedTenant = Request & {
  user?: AuthenticatedUser;
  resolvedTenant?: ResolvedTenant;
};

/** Message unique pour toute tentative de sortie de son tenant. */
const TENANT_OWNERSHIP_ERROR =
  "Accès refusé : le tenant demandé n'appartient pas à votre compte.";

/**
 * Guard multi-tenant (sécurité de l'isolation entre organisations).
 *
 * Principe : **le JWT est l'unique source de vérité du tenant d'un utilisateur
 * non ROOT**. Les en-têtes `X-Tenant-Id` / `X-Tenant-Code` ne sont acceptés que
 * s'ils désignent le tenant du jeton ; tout écart de propriété est refusé
 * (403). Le ROOT (super-administrateur système, `tenant_id = NULL`) conserve un
 * accès global : le tenant est alors facultatif et éventuellement demandé par
 * en-tête.
 *
 * Le query param `?tenantId=` et le sous-domaine du header `Host` ne sont
 * volontairement PLUS exploités : ce sont des vecteurs d'injection
 * (partage de liens, journaux d'accès, en-tête `Referer`).
 *
 * Valide également que le tenant existe en base et qu'il est actif.
 * Les routes marquées @Public() ou @NoTenant() sont exemptées.
 *
 * Note : ce guard est un APP_GUARD global. Il ne peut PAS injecter de
 * providers request-scoped (TenantContextService) dans le constructeur.
 * On utilise un service singleton pour résoudre le tenant à la volée, puis on
 * publie le résultat sur la requête.
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

    const request = context
      .switchToHttp()
      .getRequest<RequestWithResolvedTenant>();

    // JwtAuthGuard s'exécute avant : sur une route protégée, `request.user` est
    // forcément renseigné. Fail-closed si l'invariant est rompu.
    const currentUser = request.user;
    if (!currentUser) {
      throw new UnauthorizedException('Authentification requise.');
    }

    // ROOT : accès global, le tenant n'est pas obligatoire. Un tenant peut
    // néanmoins être demandé par en-tête afin que le contexte de requête reste
    // cohérent (aucune restriction de périmètre ne s'applique au ROOT).
    if (currentUser.isRoot === true) {
      await this.resolveRootTenant(request);
      return true;
    }

    await this.assertTenantOwnership(request, currentUser);
    return true;
  }

  /**
   * Non ROOT : contrôle d'appartenance du tenant.
   *
   * 1. Le tenant est celui du JWT (source unique de vérité).
   * 2. `X-Tenant-Id` / `X-Tenant-Code` ne sont acceptés que s'ils concordent
   *    avec le JWT ; sinon 403.
   * 3. Aucun tenant dans le JWT → 403 (fail-closed) : les services appliquent
   *    leurs filtres uniquement quand un tenant est présent, un tenant absent
   *    reviendrait à ouvrir l'accès à tous les tenants.
   */
  private async assertTenantOwnership(
    request: RequestWithResolvedTenant,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    const tenantId = currentUser.tenantId;
    if (!tenantId) {
      throw new ForbiddenException(
        'Aucun tenant n’est associé à votre compte. Contactez un administrateur.',
      );
    }

    const claimedId = this.readHeader(request, 'x-tenant-id');
    if (claimedId && claimedId !== tenantId) {
      throw new ForbiddenException(TENANT_OWNERSHIP_ERROR);
    }

    // Le code est comparé à la revendication du JWT : pas de résolution en base
    // nécessaire. Un code fourni alors que le JWT n'en porte pas est refusé.
    const claimedCode = this.readHeader(request, 'x-tenant-code');
    if (claimedCode && claimedCode !== currentUser.tenantCode) {
      throw new ForbiddenException(TENANT_OWNERSHIP_ERROR);
    }

    const tenant = await this.tenantService.findById(tenantId);
    if (!tenant) {
      throw new UnauthorizedException('Tenant introuvable ou désactivé.');
    }

    this.attachResolvedTenant(request, tenant, 'jwt');
  }

  /**
   * ROOT : le tenant est facultatif. S'il est demandé par en-tête, il doit
   * exister et être actif ; sinon l'accès ROOT reste global, sans tenant.
   */
  private async resolveRootTenant(
    request: RequestWithResolvedTenant,
  ): Promise<void> {
    const headerId = this.readHeader(request, 'x-tenant-id');
    const headerCode = this.readHeader(request, 'x-tenant-code');
    if (!headerId && !headerCode) return;

    let tenant: Tenant | null = null;
    if (headerId) {
      tenant = await this.tenantService.findById(headerId);
    } else if (headerCode) {
      tenant = await this.tenantService.findByCode(headerCode);
    }

    if (!tenant) return;

    this.attachResolvedTenant(request, tenant, 'header');
  }

  private attachResolvedTenant(
    request: RequestWithResolvedTenant,
    tenant: Tenant,
    source: TenantSource,
  ): void {
    request.resolvedTenant = { id: tenant.id, code: tenant.code, source };
  }

  private readHeader(request: Request, name: string): string | null {
    const value = request.headers[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }
}
