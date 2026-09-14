import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Inject } from '@nestjs/common';
import type { Request } from 'express';
import { JwtPayload, AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Résolution multi-tenant inspirée du pattern efarmOS.
 *
 * Priorité de résolution :
 * 1. Tenant résolu par TenantGuard (request.resolvedTenant)
 * 2. Header X-Tenant-Id ou X-Tenant-Code
 * 3. JWT payload (tenantId / tenantCode)
 * 4. Sous-domaine de la requête
 * 5. Query param ?tenantId=
 *
 * Scope REQUEST : une instance par requête HTTP.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  private _tenantId: string | null = null;
  private _tenantCode: string | null = null;

  constructor(@Inject(REQUEST) private readonly request: Request) {
    this.resolve();
  }

  get tenantId(): string | null {
    return this._tenantId;
  }

  get tenantCode(): string | null {
    return this._tenantCode;
  }

  get hasTenant(): boolean {
    return this._tenantId !== null;
  }

  /**
   * Indique si l'utilisateur courant est ROOT (super-administrateur système
   * avec accès global, sans tenant obligatoire).
   */
  get isRoot(): boolean {
    const user = this.request.user as AuthenticatedUser | undefined;
    return user?.isRoot === true;
  }

  /**
   * Id de l'utilisateur authentifié courant (null si non authentifié).
   * Utilisé pour la traçabilité (created_by / updated_by / deleted_by).
   */
  get userId(): string | null {
    const user = this.request.user as AuthenticatedUser | undefined;
    return user?.id ?? null;
  }

  getTenantId(): string | null {
    if (this.isRoot) return null;
    if (!this._tenantId) {
      throw new UnauthorizedException(
        'Tenant non résolu. Fournissez X-Tenant-Id ou X-Tenant-Code.',
      );
    }
    return this._tenantId;
  }

  getTenantCode(): string | null {
    if (this.isRoot) return null;
    if (!this._tenantCode) {
      throw new UnauthorizedException(
        'Tenant non résolu. Fournissez X-Tenant-Id ou X-Tenant-Code.',
      );
    }
    return this._tenantCode;
  }

  private resolve(): void {
    // 0. Tenant déjà résolu par TenantGuard
    const resolved = (
      this.request as Request & {
        resolvedTenant?: { id: string; code: string };
      }
    ).resolvedTenant;
    if (resolved) {
      this._tenantId = resolved.id;
      this._tenantCode = resolved.code;
      return;
    }

    // 1. Header X-Tenant-Id ou X-Tenant-Code
    const headerId = this.request.headers['x-tenant-id'];
    const headerCode = this.request.headers['x-tenant-code'];
    if (headerId && typeof headerId === 'string') {
      this._tenantId = headerId;
      return;
    }
    if (headerCode && typeof headerCode === 'string') {
      this._tenantCode = headerCode;
      return;
    }

    // 2. JWT payload
    const user = this.request.user as
      (JwtPayload & { tenantId?: string; tenantCode?: string }) | undefined;
    if (user?.tenantId) {
      this._tenantId = user.tenantId;
      return;
    }
    if (user?.tenantCode) {
      this._tenantCode = user.tenantCode;
      return;
    }

    // 3. Sous-domaine
    const host = this.request.get('host') ?? '';
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      this._tenantCode = subdomain;
      return;
    }

    // 4. Query param
    const queryTenantId = this.request.query?.tenantId;
    if (queryTenantId && typeof queryTenantId === 'string') {
      this._tenantId = queryTenantId;
      return;
    }
  }

  setTenant(id: string, code: string): void {
    this._tenantId = id;
    this._tenantCode = code;
  }
}
