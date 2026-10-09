import { HttpStatus } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import { UserAccessLockHistory } from './entities/user-access-lock-history.entity';
import { Role } from '../roles/entities/role.entity';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { BusinessException } from '../../common/exceptions/business.exception';
import { TenantContextService } from '../tenants/tenant-context.service';
import { SearchService } from '../../common/services/search.service';
import { SoftDeleteService } from '../../common/services/soft-delete.service';
import { BulkOperationsService } from '../../common/services/bulk-operations.service';
import { PasswordService } from '../../common/services/password.service';
import { SupabaseStorageService } from '../../common/services/supabase-storage.service';
import { ActivationService } from '../auth/activation.service';

/**
 * Tests unitaires de la sécurité des rôles côté UsersService (AUDIT-002) :
 * - aucun rôle global (`tenant_id IS NULL`, ex. ROOT) ne peut être attribué ;
 * - le filtre tenant n'est jamais omis silencieusement ;
 * - les mutations de rôles sont atomiques.
 *
 * Aucune base de données n'est utilisée : tous les dépôts sont simulés.
 */

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const ROOT_USER_ID = '44444444-4444-4444-4444-444444444444';
const OTHER_USER_ID = '55555555-5555-5555-5555-555555555555';
const ACTOR_ID = '66666666-6666-6666-6666-666666666666';
const UNKNOWN_ID = '99999999-9999-9999-9999-999999999999';

interface RoleFindOptions {
  where: {
    code: { value: string[] };
    tenantId?: string | { type: string } | null;
  };
}

const role = (id: string, code: string, tenantId: string | null): Role =>
  ({ id, code, tenantId }) as Role;

const user = (id: string, tenantId: string | null): User =>
  ({ id, tenantId, email: `${id}@transci.com` }) as User;

/** Chaîne QueryBuilder simulée (getRolesMap / hasRole / deleteRoleLinks). */
const buildChain = () => {
  const chain: Record<string, jest.Mock> = {};
  const methods = [
    'innerJoin',
    'innerJoinAndSelect',
    'leftJoin',
    'select',
    'from',
    'delete',
    'where',
    'andWhere',
    'orderBy',
    'skip',
    'take',
  ];
  for (const method of methods) {
    chain[method] = jest.fn(() => chain);
  }
  chain.execute = jest.fn(() => Promise.resolve({ affected: 1 }));
  chain.getCount = jest.fn(() => Promise.resolve(0));
  chain.getMany = jest.fn(() => Promise.resolve([]));
  chain.getQuery = jest.fn(() => 'SELECT id FROM roles');
  return chain;
};

function buildService() {
  // --- jeu de rôles de test -----------------------------------------------
  const ROLES: Role[] = [
    role('role-root', 'ROOT', null),
    role('role-admin-a', 'ADMIN', TENANT_A),
    role('role-admin-b', 'ADMIN', TENANT_B),
    role('role-operateur-a', 'OPERATEUR', TENANT_A),
  ];

  /** Simule `Repository.find` sur le filtre réellement transmis. */
  const findRoles = jest.fn((options: RoleFindOptions): Promise<Role[]> => {
    const codes = options.where.code.value;
    const tenantFilter = options.where.tenantId;
    if (tenantFilter && typeof tenantFilter === 'object') {
      // IsNull() : recherche d'un rôle global.
      return Promise.resolve(
        ROLES.filter((r) => r.tenantId === null && codes.includes(r.code)),
      );
    }
    return Promise.resolve(
      ROLES.filter(
        (r) => r.tenantId === (tenantFilter ?? null) && codes.includes(r.code),
      ),
    );
  });

  const roleRepo = {
    find: findRoles,
    createQueryBuilder: jest.fn(() => buildChain()),
  };

  const userRepo = {
    findOne: jest.fn(() => Promise.resolve(user(USER_ID, TENANT_A))),
    save: jest.fn((u: User) => Promise.resolve(u)),
    manager: {},
  };

  const userRoleChain = buildChain();
  const userRoleRepo = {
    createQueryBuilder: jest.fn(() => userRoleChain),
    find: jest.fn(() => Promise.resolve([])),
    create: jest.fn((data: Partial<UserRole>) => data as UserRole),
    save: jest.fn((data: Partial<UserRole>) =>
      Promise.resolve(data as UserRole),
    ),
    delete: jest.fn(() => Promise.resolve({ affected: 2 })),
  };

  const txManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Role) return roleRepo;
      if (entity === UserRole) return userRoleRepo;
      return userRepo;
    }),
  };
  const transaction = jest.fn(
    (cb: (manager: typeof txManager) => Promise<unknown>) => cb(txManager),
  );
  userRoleRepo.manager = { transaction };

  const messageService = {
    success: jest.fn((code: string, data: unknown) => ({ code, data })),
    getMessage: jest.fn((code: string) => code),
    throwBusiness: jest.fn((code: string, status?: number): never => {
      throw new BusinessException(code, code, status);
    }),
  };

  const tenantContext = {
    userId: ACTOR_ID,
    tenantId: TENANT_A,
    isRoot: false,
  };

  const bulkOperationsService = {
    buildResult: jest.fn(
      (
        total: number,
        successCount: number,
        failedIds: string[],
        message: string,
      ) => ({ total, successCount, failedIds, message }),
    ),
  };

  const service = new UsersService(
    userRepo as unknown as Repository<User>,
    userRoleRepo as unknown as Repository<UserRole>,
    roleRepo as unknown as Repository<Role>,
    {} as unknown as Repository<UserAccessLockHistory>,
    messageService as unknown as MessageService,
    tenantContext as unknown as TenantContextService,
    {} as unknown as SearchService,
    {} as unknown as SoftDeleteService,
    bulkOperationsService as unknown as BulkOperationsService,
    {} as unknown as PasswordService,
    {} as unknown as ActivationService,
    {} as unknown as SupabaseStorageService,
  );

  return {
    service,
    userRepo,
    userRoleRepo,
    userRoleChain,
    roleRepo,
    transaction,
    tenantContextForTest: tenantContext,
  };
}

/** Accès typé à la méthode privée testée. */
const privateService = {
  resolveRoles(
    service: UsersService,
    roleCodes: string[],
    tenantId: string | null,
  ): Promise<Role[]> {
    return (
      service as unknown as {
        resolveRoles(codes: string[], tenantId: string | null): Promise<Role[]>;
      }
    ).resolveRoles(roleCodes, tenantId);
  },
};

/** Récupère l'exception métier levée, en échouant si aucune ne l'est. */
async function captureError(
  promise: Promise<unknown>,
): Promise<BusinessException> {
  const error: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BusinessException);
  return error as BusinessException;
}

const expectCode = (error: BusinessException, code: string, status: number) => {
  expect(error.getStatus()).toBe(status);
  expect(error.getResponse()).toEqual({ code, message: code });
};

describe('UsersService — résolution des rôles (multi-tenant)', () => {
  it('refuse un tenant absent (null) sans interroger la base', async () => {
    const { service, roleRepo } = buildService();

    const error = await captureError(
      privateService.resolveRoles(service, ['ROOT'], null),
    );

    expectCode(error, MessageCode.ACCESS_DENIED, HttpStatus.FORBIDDEN);
    // Aucun chemin ne doit résoudre des rôles hors tenant.
    expect(roleRepo.find).not.toHaveBeenCalled();
  });

  it('refuse un code correspondant à un rôle global (ROOT)', async () => {
    const { service, roleRepo } = buildService();

    const error = await captureError(
      privateService.resolveRoles(service, ['ROOT'], TENANT_A),
    );

    expectCode(error, MessageCode.ACCESS_DENIED, HttpStatus.FORBIDDEN);
    // Seule la détection du rôle global est exécutée, jamais la résolution
    // dans le tenant.
    expect(roleRepo.find).toHaveBeenCalledTimes(1);
  });

  it("refuse un rôle retourné qui n'appartient pas au tenant demandé", async () => {
    const { service, roleRepo } = buildService();
    roleRepo.find.mockImplementationOnce(() => Promise.resolve([]));
    roleRepo.find.mockImplementationOnce(() =>
      Promise.resolve([role('role-admin-b', 'ADMIN', TENANT_B)]),
    );

    const error = await captureError(
      privateService.resolveRoles(service, ['ADMIN'], TENANT_A),
    );

    expectCode(error, MessageCode.ACCESS_DENIED, HttpStatus.FORBIDDEN);
  });

  it('accepte les rôles du tenant demandé et rejette les codes inconnus', async () => {
    const { service } = buildService();

    const roles = await privateService.resolveRoles(
      service,
      ['ADMIN', 'OPERATEUR'],
      TENANT_A,
    );
    expect(roles.map((r) => r.code)).toEqual(['ADMIN', 'OPERATEUR']);

    const error = await captureError(
      privateService.resolveRoles(service, ['INCONNU'], TENANT_A),
    );
    expectCode(error, MessageCode.ROLE_NOT_FOUND, HttpStatus.NOT_FOUND);
  });
});

describe('UsersService — assignRoles', () => {
  it('refuse ROOT (403) sans supprimer les rôles existants', async () => {
    const { service, userRoleRepo } = buildService();

    const error = await captureError(
      service.assignRoles(USER_ID, { roleCodes: ['ROOT'] }),
    );

    expectCode(error, MessageCode.ACCESS_DENIED, HttpStatus.FORBIDDEN);
    expect(userRoleRepo.delete).not.toHaveBeenCalled();
    expect(userRoleRepo.save).not.toHaveBeenCalled();
  });

  it('refuse ROOT sur une cible sans tenant (compte ROOT)', async () => {
    const { service, userRepo, userRoleRepo } = buildService();
    userRepo.findOne.mockResolvedValue(user(ROOT_USER_ID, null));
    userRoleRepo.createQueryBuilder.mockImplementation(() => {
      const chain = buildChain();
      chain.getCount = jest.fn(() => Promise.resolve(1)); // cible ROOT
      return chain;
    });

    const error = await captureError(
      service.assignRoles(ROOT_USER_ID, { roleCodes: ['ROOT'] }),
    );

    expectCode(error, MessageCode.ACCESS_DENIED, HttpStatus.FORBIDDEN);
    expect(userRoleRepo.delete).not.toHaveBeenCalled();
  });

  it('refuse ROOT même pour un acteur ROOT (rôle global non assignable)', async () => {
    const { service, userRepo, tenantContextForTest } = buildService();
    tenantContextForTest.isRoot = true;
    userRepo.findOne.mockResolvedValue(user(ROOT_USER_ID, null));

    const error = await captureError(
      service.assignRoles(ROOT_USER_ID, { roleCodes: ['ROOT'] }),
    );

    expectCode(error, MessageCode.ACCESS_DENIED, HttpStatus.FORBIDDEN);
  });

  it('laisse les rôles intacts quand un code est inexistant (404)', async () => {
    const { service, userRoleRepo } = buildService();

    const error = await captureError(
      service.assignRoles(USER_ID, { roleCodes: ['ADMIN', 'INCONNU'] }),
    );

    expectCode(error, MessageCode.ROLE_NOT_FOUND, HttpStatus.NOT_FOUND);
    // Test clé de l'atomicité : le DELETE n'a jamais été exécuté.
    expect(userRoleRepo.delete).not.toHaveBeenCalled();
    expect(userRoleRepo.save).not.toHaveBeenCalled();
  });

  it('remplace les rôles dans une transaction (résolution puis écriture)', async () => {
    const { service, userRoleRepo, transaction } = buildService();

    const response = await service.assignRoles(USER_ID, {
      roleCodes: ['ADMIN'],
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(userRoleRepo.delete).toHaveBeenCalledTimes(1);
    expect(userRoleRepo.delete).toHaveBeenCalledWith({ userId: USER_ID });
    expect(userRoleRepo.save).toHaveBeenCalledTimes(1);
    expect(userRoleRepo.save).toHaveBeenCalledWith({
      userId: USER_ID,
      roleId: 'role-admin-a',
      tenantId: TENANT_A,
    });
    expect(response.code).toBe(MessageCode.USER_ROLES_UPDATED);
  });

  it('insère chaque rôle une seule fois même si le code est dupliqué', async () => {
    const { service, userRoleRepo } = buildService();

    await service.assignRoles(USER_ID, { roleCodes: ['ADMIN', 'ADMIN'] });

    expect(userRoleRepo.save).toHaveBeenCalledTimes(1);
  });

  it('abandonne la transaction si une écriture échoue', async () => {
    const { service, userRoleRepo } = buildService();
    userRoleRepo.save.mockRejectedValueOnce(new Error('échec SQL'));

    await expect(
      service.assignRoles(USER_ID, { roleCodes: ['ADMIN'] }),
    ).rejects.toThrow('échec SQL');

    // Le DELETE a bien eu lieu dans la transaction : c'est le rollback
    // assuré par TypeORM qui garantit le retour à l'état initial.
    expect(userRoleRepo.delete).toHaveBeenCalledTimes(1);
  });
});

describe('UsersService — removeRoles', () => {
  it('supprime les liens dans une transaction', async () => {
    const { service, userRoleChain, transaction } = buildService();

    const response = await service.removeRoles(USER_ID, {
      roleCodes: ['OPERATEUR'],
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(userRoleChain.execute).toHaveBeenCalledTimes(1);
    expect(response.code).toBe(MessageCode.USER_ROLES_UPDATED);
  });

  it("refuse de retirer ROOT d'un compte ROOT pour un acteur non ROOT", async () => {
    const { service, userRoleRepo } = buildService();
    userRoleRepo.createQueryBuilder.mockImplementation(() => {
      const chain = buildChain();
      chain.getCount = jest.fn(() => Promise.resolve(1));
      return chain;
    });

    const error = await captureError(
      service.removeRoles(ROOT_USER_ID, { roleCodes: ['ROOT'] }),
    );

    expectCode(error, MessageCode.ACCESS_DENIED, HttpStatus.FORBIDDEN);
  });
});

describe('UsersService — bulkAssignRoles', () => {
  it('isole les échecs par cible sans état partiel', async () => {
    const { service, userRepo, userRoleRepo } = buildService();
    userRepo.findOne.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === UNKNOWN_ID ? null : user(where.id, TENANT_A),
        ),
    );

    const response = await service.bulkAssignRoles({
      ids: [USER_ID, UNKNOWN_ID],
      roleCodes: ['ADMIN'],
    });

    const data = response.data as unknown as {
      total: number;
      successCount: number;
      failedIds: string[];
    };
    expect(data.total).toBe(2);
    expect(data.successCount).toBe(1);
    expect(data.failedIds).toEqual([UNKNOWN_ID]);
    // Une seule cible mutée, une seule fois.
    expect(userRoleRepo.delete).toHaveBeenCalledTimes(1);
    expect(userRoleRepo.delete).toHaveBeenCalledWith({ userId: USER_ID });
  });

  it("place une cible en échec si la phase d'écriture échoue", async () => {
    const { service, userRoleRepo } = buildService();
    userRoleRepo.save.mockRejectedValue(new Error('échec SQL'));

    const response = await service.bulkAssignRoles({
      ids: [USER_ID, OTHER_USER_ID],
      roleCodes: ['ADMIN'],
    });

    const data = response.data as unknown as {
      successCount: number;
      failedIds: string[];
    };
    expect(data.successCount).toBe(0);
    expect(data.failedIds).toEqual([USER_ID, OTHER_USER_ID]);
  });

  it('refuse un rôle global pour toutes les cibles, sans aucune écriture', async () => {
    const { service, userRoleRepo } = buildService();

    const response = await service.bulkAssignRoles({
      ids: [USER_ID, OTHER_USER_ID],
      roleCodes: ['ROOT'],
    });

    const data = response.data as unknown as {
      successCount: number;
      failedIds: string[];
    };
    expect(data.successCount).toBe(0);
    expect(data.failedIds).toEqual([USER_ID, OTHER_USER_ID]);
    expect(userRoleRepo.delete).not.toHaveBeenCalled();
    expect(userRoleRepo.save).not.toHaveBeenCalled();
  });
});
