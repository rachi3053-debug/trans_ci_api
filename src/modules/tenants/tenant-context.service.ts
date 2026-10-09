import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Inject } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ResolvedTenant } from './tenant.guard';

/**
 * Origine de la valeur de tenant exposée par le contexte.
 * - `guard` : tenant validé par `TenantGuard` (existence + activation en base).
 * - `jwt`   : tenant porté par le jeton d'accès, non résolu par le guard
 *             (route `@NoTenant()`).
 * - `header`: requête anonyme (`@Public()`) — seuls les en-têtes X-Tenant-Id /
 *             X-Tenant-Code sont alors lus (flux d'inscription).
 * - `conflict`: le tenant résolu par le guard diverge du JWT (situation anormale
 *             déjà refusée par le guard) : le JWT reste prioritaire et
 *             `getTenantId()` lève une exception (fail-closed).
 * - `none`   : aucun tenant exploitable.
 */
export type TenantContextSource =
  'guard' | 'jwt' | 'header' | 'conflict' | 'none';

/**
 * Contexte tenant de la requête (scope REQUEST).
 *
 * Sources retenues, par ordre d'autorité décroissante :
 * 1. `request.resolvedTenant` — validé par `TenantGuard`, qui n'accepte pour un
 *    non ROOT que le tenant porté par le JWT.
 * 2. `request.user.tenantId` / `tenantCode` — revendication du JWT.
 * 3. Headers `X-Tenant-Id` / `X-Tenant-Code` — requêtes **anonymes** uniquement
 *    (`@Public()`, ex. `/auth/register`), faute d'identité à laquelle rattacher
 *    un tenant.
 *
 * Le query param `?tenantId=` et le sous-domaine du header `Host` ne sont plus
 * exploités : vecteurs d'injection (partage de liens, journaux d'accès,
 * en-tête `Referer`) et contournables par n'importe quel client.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  private _tenantId: string | null = null;
  private _tenantCode: string | null = null;
  private _source: TenantContextSource = 'none';
  private _conflict = false;

  constructor(@Inject(REQUEST) private readonly request: Request) {
    this.resolve();
  }

  /**
   * Tenant effectif de la requête. Ne peut provenir que d'une source validée
   * (guard, JWT, ou en-tête sur une requête anonyme).
   */
  get tenantId(): string | null {
    return this._tenantId;
  }

  get tenantCode(): string | null {
    return this._tenantCode;
  }

  get hasTenant(): boolean {
    return this._tenantId !== null;
  }

  /** Origine de la valeur de tenant (traçabilité / diagnostic). */
  get source(): TenantContextSource {
    return this._source;
  }

  /**
   * Tenant tel que revendiqué par le jeton d'accès (null si non authentifié ou
   * ROOT). Sert de référence pour comparer le tenant résolu par le guard.
   */
  get jwtTenantId(): string | null {
    return this.user?.tenantId ?? null;
  }

  /**
   * Indique si l'utilisateur courant est ROOT (super-administrateur système
   * avec accès global, sans tenant obligatoire).
   */
  get isRoot(): boolean {
    return this.user?.isRoot === true;
  }

  /**
   * Id de l'utilisateur authentifié courant (null si non authentifié).
   * Utilisé pour la traçabilité (created_by / updated_by / deleted_by).
   */
  get userId(): string | null {
    return this.user?.id ?? null;
  }

  getTenantId(): string | null {
    if (this.isRoot) return null;
    if (this._conflict) {
      throw new UnauthorizedException(
        'Contexte tenant incohérent : le tenant de la requête ne correspond pas à votre compte.',
      );
    }
    if (!this._tenantId) {
      throw new UnauthorizedException(
        'Tenant non résolu. Aucun tenant n’est associé à votre compte.',
      );
    }
    return this._tenantId;
  }

  getTenantCode(): string | null {
    if (this.isRoot) return null;
    if (this._conflict) {
      throw new UnauthorizedException(
        'Contexte tenant incohérent : le tenant de la requête ne correspond pas à votre compte.',
      );
    }
    if (!this._tenantCode) {
      throw new UnauthorizedException(
        'Tenant non résolu. Aucun tenant n’est associé à votre compte.',
      );
    }
    return this._tenantCode;
  }

  /**
   * Rattache explicitement un tenant au contexte (réservé au code de confiance :
   * la valeur doit provenir de `TenantService`).
   */
  setTenant(id: string, code: string): void {
    this._tenantId = id;
    this._tenantCode = code;
    this._source = 'guard';
    this._conflict = false;
  }

  private get user(): AuthenticatedUser | undefined {
    return this.request.user as AuthenticatedUser | undefined;
  }

  private resolve(): void {
    const resolved = (
      this.request as Request & { resolvedTenant?: ResolvedTenant }
    ).resolvedTenant;
    const user = this.user;

    // 1. Tenant validé par le TenantGuard (source de référence).
    if (resolved) {
      if (!user || user.isRoot === true || !user.tenantId) {
        this._tenantId = resolved.id;
        this._tenantCode = resolved.code;
        this._source = 'guard';
        return;
      }
      if (resolved.id === user.tenantId) {
        this._tenantId = resolved.id;
        this._tenantCode = resolved.code;
        this._source = 'guard';
        return;
      }
      // Situation anormale (guard contourné) : le JWT reste prioritaire et le
      // contexte est marqué en conflit pour que les getters stricts lèvent.
      this._tenantId = user.tenantId;
      this._tenantCode = user.tenantCode ?? null;
      this._source = 'conflict';
      this._conflict = true;
      return;
    }

    // 2. ROOT : accès global, aucun tenant implicite.
    if (user?.isRoot === true) return;

    // 3. Tenant du JWT (route @NoTenant() : le guard n'a rien résolu).
    if (user) {
      this._tenantId = user.tenantId ?? null;
      this._tenantCode = user.tenantCode ?? null;
      this._source = user.tenantId ? 'jwt' : 'none';
      return;
    }

    // 4. Requête anonyme (@Public) : en-têtes uniquement, pour le tenant cible.
    //    Aucune identité n'étant vérifiable, il ne s'agit pas d'un contournement
    //    d'isolation (cf. décision documentée : l'inscription publique reste
    //    ouverte, à encadrer via une invitation).
    const headerId = this.readHeader('x-tenant-id');
    if (headerId) {
      this._tenantId = headerId;
      this._source = 'header';
      return;
    }
    const headerCode = this.readHeader('x-tenant-code');
    if (headerCode) {
      this._tenantCode = headerCode;
      this._source = 'header';
    }
  }

  private readHeader(name: string): string | null {
    const value = this.request.headers[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }
}
