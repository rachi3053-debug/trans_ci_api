import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Tenant } from './entities/tenant.entity';
import { TenantGuard, ResolvedTenant } from './tenant.guard';
import { TenantService } from './tenant.service';
import { Public } from '../auth/guards/public.decorator';
import { NoTenant } from './decorators/no-tenant.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const tenantA = {
  id: TENANT_A,
  code: 'TENANT_A',
  isActive: true,
} as Tenant;
const tenantB = {
  id: TENANT_B,
  code: 'TENANT_B',
  isActive: true,
} as Tenant;

interface TenantServiceMock {
  findById: jest.Mock;
  findByCode: jest.Mock;
}

interface FakeRequest extends Request {
  user?: Partial<AuthenticatedUser>;
  resolvedTenant?: ResolvedTenant;
}

class TestController {
  @Public()
  publicRoute(this: void): void {
    // route publique : aucune résolution tenant attendue
  }

  @NoTenant()
  noTenantRoute(this: void): void {
    // route authentifiée sans exigence de tenant
  }

  protectedRoute(this: void): void {
    // route métier standard
  }
}

const describeGuard = (): void => {
  const reflector = new Reflector();
  let tenantServiceMock: TenantServiceMock;

  const guard = (): TenantGuard =>
    new TenantGuard(reflector, tenantServiceMock as unknown as TenantService);

  const buildRequest = (options: {
    user?: Partial<AuthenticatedUser>;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  }): FakeRequest =>
    ({
      user: options.user,
      headers: options.headers ?? {},
      query: options.query ?? {},
    }) as unknown as FakeRequest;

  const buildContext = (
    request: FakeRequest,
    target: () => void = TestController.prototype.protectedRoute,
  ): ExecutionContext =>
    ({
      getHandler: () => target,
      getClass: () => TestController,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const tenantAUser: Partial<AuthenticatedUser> = {
    id: 'user-a',
    email: 'a@transci.com',
    roles: ['ADMIN'],
    permissions: ['USER:READ'],
    tenantId: TENANT_A,
    tenantCode: 'TENANT_A',
    isRoot: false,
  };

  beforeEach(() => {
    tenantServiceMock = {
      findById: jest.fn().mockResolvedValue(tenantA),
      findByCode: jest.fn().mockResolvedValue(tenantA),
    };
  });

  it('refuse un tenant différent via X-Tenant-Id', async () => {
    const request = buildRequest({
      user: tenantAUser,
      headers: { 'x-tenant-id': TENANT_B },
    });

    await expect(
      guard().canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(request.resolvedTenant).toBeUndefined();
  });

  it('refuse un tenant différent via X-Tenant-Code', async () => {
    const request = buildRequest({
      user: tenantAUser,
      headers: { 'x-tenant-code': 'TENANT_B' },
    });

    await expect(
      guard().canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignore le query param ?tenantId= (vecteur d’injection)', async () => {
    const request = buildRequest({
      user: tenantAUser,
      query: { tenantId: TENANT_B },
    });

    await expect(guard().canActivate(buildContext(request))).resolves.toBe(
      true,
    );
    expect(request.resolvedTenant).toEqual({
      id: TENANT_A,
      code: 'TENANT_A',
      source: 'jwt',
    });
  });

  it('ignore le sous-domaine du header Host (vecteur d’injection)', async () => {
    const request = buildRequest({
      user: tenantAUser,
      headers: { host: 'tenant-b.transci-ci.com' },
    });

    await expect(guard().canActivate(buildContext(request))).resolves.toBe(
      true,
    );
    expect(request.resolvedTenant?.id).toBe(TENANT_A);
  });

  it('accepte un en-tête cohérent avec le JWT', async () => {
    const request = buildRequest({
      user: tenantAUser,
      headers: { 'x-tenant-id': TENANT_A, 'x-tenant-code': 'TENANT_A' },
    });

    await expect(guard().canActivate(buildContext(request))).resolves.toBe(
      true,
    );
    expect(tenantServiceMock.findById).toHaveBeenCalledWith(TENANT_A);
  });

  it('accepte une requête sans en-tête (tenant porté par le JWT)', async () => {
    const request = buildRequest({ user: tenantAUser });

    await expect(guard().canActivate(buildContext(request))).resolves.toBe(
      true,
    );
    expect(request.resolvedTenant?.source).toBe('jwt');
  });

  it('refuse un utilisateur authentifié sans tenant (fail-closed)', async () => {
    const request = buildRequest({
      user: { ...tenantAUser, tenantId: undefined, tenantCode: undefined },
      headers: { 'x-tenant-id': TENANT_B },
    });

    await expect(
      guard().canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantServiceMock.findById).not.toHaveBeenCalled();
  });

  it('refuse un tenant inexistant ou désactivé', async () => {
    tenantServiceMock.findById.mockResolvedValue(null);
    const request = buildRequest({ user: tenantAUser });

    await expect(
      guard().canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.resolvedTenant).toBeUndefined();
  });

  it('refuse une route protégée sans utilisateur authentifié', async () => {
    const request = buildRequest({ headers: { 'x-tenant-id': TENANT_B } });

    await expect(
      guard().canActivate(buildContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('laisse le ROOT accéder sans en-tête ni tenant', async () => {
    const request = buildRequest({
      user: { id: 'root', isRoot: true, roles: ['ROOT'], permissions: [] },
    });

    await expect(guard().canActivate(buildContext(request))).resolves.toBe(
      true,
    );
    expect(request.resolvedTenant).toBeUndefined();
    expect(tenantServiceMock.findById).not.toHaveBeenCalled();
  });

  it('laisse le ROOT selectionner un tenant via X-Tenant-Id', async () => {
    tenantServiceMock.findById.mockResolvedValue(tenantB);
    const request = buildRequest({
      user: { id: 'root', isRoot: true, roles: ['ROOT'], permissions: [] },
      headers: { 'x-tenant-id': TENANT_B },
    });

    await expect(guard().canActivate(buildContext(request))).resolves.toBe(
      true,
    );
    expect(request.resolvedTenant).toEqual({
      id: TENANT_B,
      code: 'TENANT_B',
      source: 'header',
    });
  });

  it('conserve l’accès global du ROOT si le tenant demandé est inconnu', async () => {
    tenantServiceMock.findById.mockResolvedValue(null);
    const request = buildRequest({
      user: { id: 'root', isRoot: true, roles: ['ROOT'], permissions: [] },
      headers: { 'x-tenant-id': TENANT_B },
    });

    await expect(guard().canActivate(buildContext(request))).resolves.toBe(
      true,
    );
    expect(request.resolvedTenant).toBeUndefined();
  });

  it('court-circuite les routes @Public() avant toute résolution', async () => {
    const request = buildRequest({ headers: { 'x-tenant-id': TENANT_B } });
    const target = TestController.prototype.publicRoute;

    await expect(
      guard().canActivate(buildContext(request, target)),
    ).resolves.toBe(true);
    expect(tenantServiceMock.findById).not.toHaveBeenCalled();
    expect(request.resolvedTenant).toBeUndefined();
  });

  it('court-circuite les routes @NoTenant() avant toute résolution', async () => {
    const request = buildRequest({ user: tenantAUser });
    const target = TestController.prototype.noTenantRoute;

    await expect(
      guard().canActivate(buildContext(request, target)),
    ).resolves.toBe(true);
    expect(tenantServiceMock.findById).not.toHaveBeenCalled();
    expect(request.resolvedTenant).toBeUndefined();
  });
};

describe('TenantGuard (isolation multi-tenant)', describeGuard);
