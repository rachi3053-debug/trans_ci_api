import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { User, UserStatus } from './entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import {
  UserAccessLockHistory,
  AccessLockAction,
} from './entities/user-access-lock-history.entity';
import { Role } from '../roles/entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { RemoveRolesDto } from './dto/remove-roles.dto';
import { SetupPasswordDto, PasswordAction } from './dto/setup-password.dto';
import {
  AccessLockDto,
  AccessLockHistoryFilterDto,
} from './dto/access-lock.dto';
import { UserSearchFilterDto } from './dto/user-search-filter.dto';
import {
  BulkAssignRolesDto,
  BulkDeleteDto,
  BulkToggleStatusDto,
  BulkOperationResultDto,
} from '../../common/dto/bulk-operations.dto';
import { PaginatedResponseDto } from '../../common/responses/paginated-response.dto';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ApiResponse } from '../../common/responses/api-response.interface';
import { TenantContextService } from '../tenants/tenant-context.service';
import { SearchService } from '../../common/services/search.service';
import { SoftDeleteService } from '../../common/services/soft-delete.service';
import { BulkOperationsService } from '../../common/services/bulk-operations.service';
import { PasswordService } from '../../common/services/password.service';
import { ActivationService } from '../auth/activation.service';
import { SupabaseStorageService } from '../../common/services/supabase-storage.service';

type SafeUser = Omit<User, 'passwordHash'> & { roles?: Role[] };

function omitPassword(user: User): SafeUser {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
}

const SEARCH_FIELDS = ['nom', 'prenom', 'email', 'telephone'];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    @InjectRepository(UserAccessLockHistory)
    private accessLockRepo: Repository<UserAccessLockHistory>,
    private readonly messageService: MessageService,
    private readonly tenantContext: TenantContextService,
    private readonly searchService: SearchService,
    private readonly softDeleteService: SoftDeleteService,
    private readonly bulkOperationsService: BulkOperationsService,
    private readonly passwordService: PasswordService,
    private readonly activationService: ActivationService,
    private readonly storageService: SupabaseStorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers multi-tenant
  // ---------------------------------------------------------------------------

  private get actorId(): string | null {
    return this.tenantContext.userId;
  }

  /**
   * Construit le filtre `where` appliqué au tenant courant.
   * ROOT voit toutes les entités ; les autres utilisateurs sont scopés par tenant.
   */
  private tenantScope(id: string): FindOptionsWhere<User> {
    const where: FindOptionsWhere<User> = { id };
    if (!this.tenantContext.isRoot && this.tenantContext.tenantId) {
      where.tenantId = this.tenantContext.tenantId;
    }
    return where;
  }

  private async findScoped(
    id: string,
    options: { withDeleted?: boolean } = {},
  ): Promise<User | null> {
    return this.userRepo.findOne({
      where: this.tenantScope(id),
      withDeleted: options.withDeleted,
    });
  }

  private async getUserOrThrow(id: string, withDeleted = false): Promise<User> {
    const user = await this.findScoped(id, { withDeleted });
    if (!user) {
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return user;
  }

  private async getRolesMap(userIds: string[]): Promise<Map<string, Role[]>> {
    const map = new Map<string, Role[]>();
    if (userIds.length === 0) return map;

    const rows = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoinAndSelect('ur.role', 'role')
      .where('ur.userId IN (:...userIds)', { userIds })
      .getMany();

    for (const row of rows) {
      if (!map.has(row.userId)) map.set(row.userId, []);
      map.get(row.userId)!.push(row.role);
    }
    return map;
  }

  private async attachRoles(users: User[]): Promise<SafeUser[]> {
    const map = await this.getRolesMap(users.map((u) => u.id));
    return users.map((u) => ({
      ...omitPassword(u),
      roles: map.get(u.id) ?? [],
    }));
  }

  private async hasRole(userId: string, code: string): Promise<boolean> {
    const count = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'role')
      .where('ur.userId = :userId', { userId })
      .andWhere('role.code = :code', { code })
      .getCount();
    return count > 0;
  }

  private async isRootUser(userId: string): Promise<boolean> {
    return this.hasRole(userId, 'ROOT');
  }

  /**
   * Un compte ROOT ne peut être modifié que par un autre ROOT.
   */
  private async assertNotRootTarget(id: string): Promise<void> {
    if (!this.tenantContext.isRoot && (await this.isRootUser(id))) {
      this.messageService.throwBusiness(
        MessageCode.ACCESS_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * Gestion "sensible" (mot de passe, blocage) : ROOT, l'utilisateur lui-même
   * ou un ADMIN sont autorisés.
   */
  private async assertCanManageUser(id: string): Promise<void> {
    const actor = this.actorId;
    if (this.tenantContext.isRoot || actor === id) return;
    if (actor && (await this.hasRole(actor, 'ADMIN'))) return;
    this.messageService.throwBusiness(
      MessageCode.ACCESS_DENIED,
      HttpStatus.FORBIDDEN,
    );
  }

  /**
   * Résout les rôles demandés dans le scope d'un tenant donné.
   * TypeORM ignore les conditions `undefined` : tenantId null (ROOT) = rôle global.
   */
  private async resolveRoles(
    roleCodes: string[],
    tenantId: string | null,
  ): Promise<Role[]> {
    const where: FindOptionsWhere<Role> = { code: In(roleCodes) };
    if (tenantId) where.tenantId = tenantId;
    const roles = await this.roleRepo.find({ where });
    const found = new Set(roles.map((r) => r.code));
    const missing = roleCodes.find((c) => !found.has(c));
    if (missing) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return roles;
  }

  private async linkRoles(
    userId: string,
    roles: Role[],
    tenantId: string | null,
  ): Promise<void> {
    for (const role of roles) {
      const ur = this.userRoleRepo.create({
        userId,
        roleId: role.id,
        tenantId,
      });
      await this.userRoleRepo.save(ur);
    }
  }

  /**
   * Retire les liens vers des rôles précis (via leurs codes).
   */
  private async deleteRoleLinks(
    userId: string,
    roleCodes: string[],
  ): Promise<void> {
    await this.userRoleRepo
      .createQueryBuilder()
      .delete()
      .from(UserRole)
      .where('user_role.userId = :userId', { userId })
      .andWhere(
        'user_role.roleId IN (' +
          this.roleRepo
            .createQueryBuilder('role')
            .select('role.id')
            .where('role.code IN (:...codes)', { codes: roleCodes })
            .getQuery() +
          ')',
      )
      .execute();
  }

  // ---------------------------------------------------------------------------
  // Liste / recherche
  // ---------------------------------------------------------------------------

  async findAll(
    filter: UserSearchFilterDto,
  ): Promise<PaginatedResponseDto<SafeUser>> {
    return this.searchUsers(filter);
  }

  /**
   * Recherche paginée (nom, prénom, email, téléphone) avec filtres rôle/statut.
   */
  async searchUsers(
    filter: UserSearchFilterDto,
  ): Promise<PaginatedResponseDto<SafeUser>> {
    const page = await this.searchService.searchAndPaginate(
      this.userRepo,
      filter,
      SEARCH_FIELDS,
      '/api/v1/users',
      'user',
      {
        scope: (qb) => {
          if (!this.tenantContext.isRoot && this.tenantContext.tenantId) {
            qb.andWhere('user.tenantId = :tenantId', {
              tenantId: this.tenantContext.tenantId,
            });
          }
          if (filter.role) {
            qb.andWhere(
              (qb2) => {
                const sub = qb2
                  .subQuery()
                  .select('1')
                  .from(UserRole, 'ur')
                  .innerJoin('ur.role', 'role')
                  .where('ur.userId = "user".id')
                  .andWhere('role.code = :roleCode')
                  .getQuery();
                return `EXISTS ${sub}`;
              },
              { roleCode: filter.role },
            );
          }
          if (filter.actif !== undefined) {
            qb.andWhere('user.actif = :actif', { actif: filter.actif });
          }
        },
      },
    );

    const data = await this.attachRoles(page.data);
    return new PaginatedResponseDto<SafeUser>(
      data,
      page.meta.total,
      page.meta.page,
      page.meta.limit,
      '/api/v1/users',
    );
  }

  /**
   * Liste des utilisateurs soft-deleted (corbeille), scope tenant.
   */
  async findDeletedUsers(
    filter: UserSearchFilterDto,
  ): Promise<PaginatedResponseDto<SafeUser>> {
    const page = await this.searchService.searchAndPaginate(
      this.userRepo,
      filter,
      SEARCH_FIELDS,
      '/api/v1/users/deleted',
      'user',
      {
        onlyDeleted: true,
        scope: (qb) => {
          if (!this.tenantContext.isRoot && this.tenantContext.tenantId) {
            qb.andWhere('user.tenantId = :tenantId', {
              tenantId: this.tenantContext.tenantId,
            });
          }
        },
      },
    );
    const data = await this.attachRoles(page.data);
    return new PaginatedResponseDto<SafeUser>(
      data,
      page.meta.total,
      page.meta.page,
      page.meta.limit,
      '/api/v1/users/deleted',
    );
  }

  async findOne(id: string): Promise<ApiResponse<SafeUser>> {
    const user = await this.getUserOrThrow(id);
    const [safe] = await this.attachRoles([user]);
    return this.messageService.success(MessageCode.USER_LIST, safe);
  }

  /**
   * Retourne un utilisateur même soft-deleted (ne l'exclut pas).
   */
  async findUserWithDeleted(id: string): Promise<ApiResponse<SafeUser>> {
    const user = await this.getUserOrThrow(id, true);
    const [safe] = await this.attachRoles([user]);
    return this.messageService.success(MessageCode.USER_LIST, safe);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(dto: CreateUserDto): Promise<ApiResponse<SafeUser>> {
    const isRoot = this.tenantContext.isRoot;
    const currentTenant = this.tenantContext.tenantId;

    // Seul le ROOT peut choisir le tenant de destination.
    let targetTenant = currentTenant;
    if (dto.tenantId) {
      if (!isRoot) {
        this.messageService.throwBusiness(
          MessageCode.ACCESS_DENIED,
          HttpStatus.FORBIDDEN,
        );
      }
      targetTenant = dto.tenantId;
    }

    const existing = await this.userRepo.findOne({
      where: {
        email: dto.email,
        tenantId: targetTenant ?? undefined,
      },
    });
    if (existing) {
      this.messageService.throwBusiness(
        MessageCode.USER_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }

    // Sans mot de passe fourni : l'utilisateur est créé en statut INVITED et
    // reçoit une invitation par email (il fixera lui-même son mot de passe).
    // Avec mot de passe fourni, il conserve le comportement historique ACTIVE.
    const invited = !dto.password;
    const passwordHash = dto.password
      ? await this.passwordService.hash(dto.password)
      : null;

    const roleCode = dto.roleCode ?? 'CONSULTATION';

    // Transaction : utilisateur + rôles + jeton d'invitation sont créés
    // atomiquement. L'email est envoyé APRÈS le commit.
    const outcome = await this.userRepo.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const userRoleRepo = manager.getRepository(UserRole);
      const roleRepo = manager.getRepository(Role);

      // Résolution du rôle (dans le tenant cible, sinon globalement) : le
      // tenant de l'utilisateur découle du rôle attribué lorsque aucun tenant
      // explicite n'est défini (cas d'un ROOT qui crée sans préciser tenantId).
      const where: FindOptionsWhere<Role> = { code: In([roleCode]) };
      if (targetTenant) where.tenantId = targetTenant;
      const roles = await roleRepo.find({ where });
      if (roles.length !== 1) {
        this.messageService.throwBusiness(
          MessageCode.ROLE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }

      const effectiveTenant = targetTenant ?? roles[0].tenantId ?? null;

      const newUser = userRepo.create({
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email,
        telephone: dto.telephone,
        passwordHash,
        tenantId: effectiveTenant,
        status: invited ? UserStatus.INVITED : UserStatus.ACTIVE,
        actif: !invited,
        accessLocked: false,
        emailVerified: !invited,
        firstConnexion: !invited,
        createdBy: this.actorId,
      });
      const created = await userRepo.save(newUser);

      for (const role of roles) {
        await userRoleRepo.save(
          userRoleRepo.create({
            userId: created.id,
            roleId: role.id,
            tenantId: effectiveTenant,
          }),
        );
      }

      const issuedToken = invited
        ? await this.activationService.issueActivationToken(created.id, manager)
        : null;

      return { user: created, issuedToken };
    });

    // Après commit de la transaction : envoi de l'email d'invitation.
    if (invited && outcome.issuedToken) {
      const to = outcome.user.email;
      const recipientName = `${outcome.user.prenom} ${outcome.user.nom}`.trim();
      await this.activationService
        .sendInvitationEmail({
          to,
          recipientName,
          rawToken: outcome.issuedToken.rawToken,
          expiresAt: outcome.issuedToken.expiresAt,
        })
        .catch((err) => {
          // L'utilisateur reste INVITED : un renvoi d'invitation sera possible.
          this.logger.error(
            `Échec envoi invitation à la création (${to})`,
            err,
          );
        });
    }

    const [safe] = await this.attachRoles([outcome.user]);
    return this.messageService.success(
      invited ? MessageCode.USER_INVITED : MessageCode.USER_CREATED,
      safe,
    );
  }

  async update(id: string, dto: UpdateUserDto): Promise<ApiResponse<SafeUser>> {
    const user = await this.getUserOrThrow(id);
    await this.assertNotRootTarget(id);

    const { roleCode, tenantId, password, ...rest } = dto;
    void roleCode;
    void tenantId;

    if (password) {
      if (user.status === UserStatus.INVITED) {
        // Un compte invité n'a pas encore fixé son mot de passe : on renvoie
        // l'invitation plutôt que de le définir côté admin.
        this.messageService.throwBusiness(
          MessageCode.USER_NOT_ACTIVATED,
          HttpStatus.FORBIDDEN,
        );
      }
      user.passwordHash = await this.passwordService.hash(password);
    }

    if (rest.email && rest.email !== user.email) {
      const other = await this.userRepo.findOne({
        where: {
          email: rest.email,
          tenantId: user.tenantId ?? undefined,
        },
      });
      if (other) {
        this.messageService.throwBusiness(
          MessageCode.USER_ALREADY_EXISTS,
          HttpStatus.CONFLICT,
        );
      }
    }

    // Synchronisation du statut avec le flag `actif` (hors flux invitation).
    if (user.status !== UserStatus.INVITED) {
      if (rest.actif === false) {
        user.status = UserStatus.DISABLED;
      } else if (rest.actif === true && user.status === UserStatus.DISABLED) {
        user.status = UserStatus.ACTIVE;
      }
    }

    Object.assign(user, rest);
    user.updatedBy = this.actorId;
    await this.userRepo.save(user);

    const [safe] = await this.attachRoles([user]);
    return this.messageService.success(MessageCode.USER_UPDATED, safe);
  }

  async remove(id: string): Promise<ApiResponse<null>> {
    await this.getUserOrThrow(id);
    await this.assertNotRootTarget(id);
    await this.softDeleteService.softDelete(this.userRepo, id, this.actorId);
    return this.messageService.success(MessageCode.USER_DELETED, null);
  }

  // ---------------------------------------------------------------------------
  // Restauration / suppression définitive
  // ---------------------------------------------------------------------------

  async restoreUser(id: string): Promise<ApiResponse<SafeUser>> {
    const user = await this.getUserOrThrow(id, true);
    await this.assertNotRootTarget(id);
    await this.softDeleteService.restore(this.userRepo, id);
    const [safe] = await this.attachRoles([user]);
    return this.messageService.success(MessageCode.USER_RESTORED, safe);
  }

  /**
   * Suppression physique irréversible. Réservée au ROOT.
   */
  async hardDeleteUser(id: string): Promise<ApiResponse<null>> {
    if (await this.isRootUser(id)) {
      this.messageService.throwBusiness(
        MessageCode.ACCESS_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }
    if (!this.tenantContext.isRoot) {
      this.messageService.throwBusiness(
        MessageCode.ACCESS_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }
    await this.getUserOrThrow(id, true);
    await this.softDeleteService.hardDelete(this.userRepo, id);
    return this.messageService.success(MessageCode.USER_HARD_DELETED, null);
  }

  // ---------------------------------------------------------------------------
  // Rôles
  // ---------------------------------------------------------------------------

  async getUserRoles(userId: string): Promise<ApiResponse<Role[]>> {
    await this.getUserOrThrow(userId);
    const userRoles = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });
    return this.messageService.success(
      MessageCode.USER_LIST,
      userRoles.map((ur) => ur.role),
    );
  }

  /**
   * Remplace tous les rôles d'un utilisateur.
   */
  async assignRoles(
    id: string,
    dto: AssignRolesDto,
  ): Promise<ApiResponse<SafeUser>> {
    const user = await this.getUserOrThrow(id);
    await this.assertNotRootTarget(id);

    await this.userRoleRepo.delete({ userId: id });
    const roles = await this.resolveRoles(dto.roleCodes, user.tenantId);
    await this.linkRoles(id, roles, user.tenantId);

    const [safe] = await this.attachRoles([user]);
    return this.messageService.success(MessageCode.USER_ROLES_UPDATED, safe);
  }

  /**
   * Retire des rôles spécifiques sans toucher aux autres.
   */
  async removeRoles(
    id: string,
    dto: RemoveRolesDto,
  ): Promise<ApiResponse<SafeUser>> {
    const user = await this.getUserOrThrow(id);
    if (
      !this.tenantContext.isRoot &&
      dto.roleCodes.includes('ROOT') &&
      (await this.isRootUser(id))
    ) {
      this.messageService.throwBusiness(
        MessageCode.ACCESS_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    await this.deleteRoleLinks(id, dto.roleCodes);

    const [safe] = await this.attachRoles([user]);
    return this.messageService.success(MessageCode.USER_ROLES_UPDATED, safe);
  }

  // ---------------------------------------------------------------------------
  // Mot de passe
  // ---------------------------------------------------------------------------

  private generateTemporaryPassword(): string {
    return randomBytes(12).toString('base64url');
  }

  /**
   * Mise en place / réinitialisation du mot de passe avec politique de sécurité :
   * - first-login : l'utilisateur (ou le ROOT) change son mot de passe provisoire
   * - set-password / reset-password : réservé aux administrateurs
   */
  async setupPassword(
    id: string,
    dto: SetupPasswordDto,
  ): Promise<ApiResponse<SafeUser & { metadata: Record<string, unknown> }>> {
    const user = await this.getUserOrThrow(id);
    await this.assertNotRootTarget(id);

    const actor = this.actorId;

    if (user.status === UserStatus.INVITED) {
      // Le mot de passe d'un compte invité ne peut pas être défini par un admin :
      // il sera choisi par l'utilisateur lors de l'activation de l'invitation.
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_ACTIVATED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (dto.passwordAction === PasswordAction.FIRST_LOGIN) {
      if (!(this.tenantContext.isRoot || actor === id)) {
        this.messageService.throwBusiness(
          MessageCode.ACCESS_DENIED,
          HttpStatus.FORBIDDEN,
        );
      }
      if (!dto.password) {
        this.messageService.throwBusiness(
          MessageCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
        );
      }
    } else {
      await this.assertCanManageUser(id);
    }

    let generatedPassword: string | undefined;
    let newPassword = dto.password;
    if (!newPassword) {
      if (dto.passwordAction !== PasswordAction.RESET_PASSWORD) {
        this.messageService.throwBusiness(
          MessageCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
        );
      }
      generatedPassword = this.generateTemporaryPassword();
      newPassword = generatedPassword;
    }

    user.passwordHash = await this.passwordService.hash(newPassword);
    user.firstConnexion =
      dto.passwordAction === PasswordAction.FIRST_LOGIN
        ? false
        : (dto.firstconnexion ?? true);
    user.updatedBy = actor;
    await this.userRepo.save(user);

    const [safe] = await this.attachRoles([user]);
    const data: SafeUser & { metadata: Record<string, unknown> } = {
      ...safe,
      metadata: {
        action: dto.passwordAction,
        generatedPassword: generatedPassword ?? undefined,
      },
    };
    return this.messageService.success(MessageCode.USER_PASSWORD_UPDATED, data);
  }

  // ---------------------------------------------------------------------------
  // Avatar (Supabase Storage - démo upload de bout en bout)
  // ---------------------------------------------------------------------------

  /**
   * Téléverse l'avatar d'un utilisateur dans le bucket `avatars`
   * (chemin `users/{userId}/...`) puis enregistre la référence en base.
   * Les droits sont vérifiés par le guard + contrôle multi-tenant existants.
   */
  async uploadAvatar(
    id: string,
    file: Express.Multer.File,
  ): Promise<ApiResponse<Record<string, unknown>>> {
    const user = await this.getUserOrThrow(id);
    await this.assertCanManageUser(id);

    // 1. Upload du fichier vers Supabase Storage (validation MIME + taille côté service).
    const uploaded = await this.storageService.uploadAvatar(user.id, file);

    // 2. Persistance de la référence en base (métadonnées uniquement, jamais le fichier).
    user.avatarPath = uploaded.path;
    await this.userRepo.save(user);

    // 3. URL signée temporaire : privilégiée pour un bucket privé (avatars).
    const signedUrl = await this.storageService.createSignedUrl(
      this.storageService.avatarsBucket,
      uploaded.path,
      3600,
    );

    return this.messageService.success(MessageCode.FILE_UPLOADED, {
      bucket: uploaded.bucket,
      path: uploaded.path,
      name: uploaded.name,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      signedUrl,
    });
  }

  /**
   * Retourne l'URL signée (temporaire) de l'avatar d'un utilisateur.
   * Le bucket `avatars` est privé : le front n'a jamais la clé Supabase.
   */
  async getAvatar(id: string): Promise<ApiResponse<Record<string, unknown>>> {
    const user = await this.getUserOrThrow(id);
    if (!user.avatarPath) {
      this.messageService.throwBusiness(
        MessageCode.FILE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    const signedUrl = await this.storageService.createSignedUrl(
      this.storageService.avatarsBucket,
      user.avatarPath,
      3600,
    );
    return this.messageService.success(MessageCode.FILE_DOWNLOADED, {
      path: user.avatarPath,
      signedUrl,
    });
  }

  // ---------------------------------------------------------------------------
  // Blocage / déblocage
  // ---------------------------------------------------------------------------

  async lockUser(
    id: string,
    dto: AccessLockDto,
  ): Promise<ApiResponse<SafeUser>> {
    const user = await this.getUserOrThrow(id);
    await this.assertNotRootTarget(id);
    await this.assertCanManageUser(id);

    user.accessLocked = true;
    user.lockedAt = new Date();
    user.lockedBy = this.actorId;
    user.lockReason = dto.reason ?? null;
    user.actif = false;
    if (user.status !== UserStatus.INVITED) {
      user.status = UserStatus.SUSPENDED;
    }
    user.updatedBy = this.actorId;
    await this.userRepo.save(user);

    await this.accessLockRepo.save(
      this.accessLockRepo.create({
        userId: id,
        action: AccessLockAction.LOCK,
        reason: dto.reason ?? null,
        performedBy: this.actorId,
      }),
    );

    const [safe] = await this.attachRoles([user]);
    return this.messageService.success(MessageCode.USER_ACCESS_LOCKED, safe);
  }

  async unlockUser(id: string): Promise<ApiResponse<SafeUser>> {
    const user = await this.getUserOrThrow(id);
    await this.assertNotRootTarget(id);
    await this.assertCanManageUser(id);

    user.accessLocked = false;
    user.lockedAt = null;
    user.lockedBy = null;
    user.lockReason = null;
    // Réactivation du compte : le mail doit rester intact, on relance l'accès.
    user.actif = true;
    if (user.status !== UserStatus.INVITED) {
      user.status = UserStatus.ACTIVE;
    }
    user.updatedBy = this.actorId;
    await this.userRepo.save(user);

    await this.accessLockRepo.save(
      this.accessLockRepo.create({
        userId: id,
        action: AccessLockAction.UNLOCK,
        reason: null,
        performedBy: this.actorId,
      }),
    );

    const [safe] = await this.attachRoles([user]);
    return this.messageService.success(MessageCode.USER_ACCESS_UNLOCKED, safe);
  }

  // ---------------------------------------------------------------------------
  // Invitation / activation
  // ---------------------------------------------------------------------------

  /**
   * Renvoi de l'invitation vers un utilisateur encore INVITED.
   * Révocation des jetons antérieurs + cooldown anti-spam.
   */
  async resendInvitation(id: string): Promise<ApiResponse<null>> {
    const user = await this.getUserOrThrow(id);
    await this.assertNotRootTarget(id);

    if (user.status !== UserStatus.INVITED) {
      this.messageService.throwBusiness(
        MessageCode.USER_ALREADY_ACTIVATED,
        HttpStatus.CONFLICT,
      );
    }

    await this.activationService.resendInvitation(user);
    return this.messageService.success(MessageCode.INVITATION_RESENT, null);
  }

  // ---------------------------------------------------------------------------
  // Opérations en masse
  // ---------------------------------------------------------------------------

  async bulkAssignRoles(
    dto: BulkAssignRolesDto,
  ): Promise<ApiResponse<BulkOperationResultDto>> {
    let successCount = 0;
    const failedIds: string[] = [];

    for (const id of dto.ids) {
      try {
        const user = await this.getUserOrThrow(id);
        await this.assertNotRootTarget(id);
        const roles = await this.resolveRoles(dto.roleCodes, user.tenantId);
        await this.userRoleRepo.delete({ userId: id });
        await this.linkRoles(id, roles, user.tenantId);
        successCount += 1;
      } catch {
        // L'id est suivi comme échec pour un rapport de résultat en masse.
        failedIds.push(id);
      }
    }

    const result = this.bulkOperationsService.buildResult(
      dto.ids.length,
      successCount,
      failedIds,
      'Rôles assignés en masse.',
    );
    return this.messageService.success(MessageCode.USERS_BULK_UPDATED, result);
  }

  /**
   * Retire des rôles en masse d'un ensemble d'utilisateurs.
   */
  async bulkRemoveRoles(
    dto: BulkAssignRolesDto,
  ): Promise<ApiResponse<BulkOperationResultDto>> {
    let successCount = 0;
    const failedIds: string[] = [];

    for (const id of dto.ids) {
      try {
        await this.getUserOrThrow(id);
        if (
          !this.tenantContext.isRoot &&
          dto.roleCodes.includes('ROOT') &&
          (await this.isRootUser(id))
        ) {
          failedIds.push(id);
          continue;
        }
        await this.deleteRoleLinks(id, dto.roleCodes);
        successCount += 1;
      } catch {
        // L'id est suivi comme échec pour un rapport de résultat en masse.
        failedIds.push(id);
      }
    }

    const result = this.bulkOperationsService.buildResult(
      dto.ids.length,
      successCount,
      failedIds,
      'Rôles retirés en masse.',
    );
    return this.messageService.success(MessageCode.USERS_BULK_UPDATED, result);
  }

  async softDeleteManyUsers(
    dto: BulkDeleteDto,
  ): Promise<ApiResponse<BulkOperationResultDto>> {
    if (!dto.confirm) {
      this.messageService.throwBusiness(
        MessageCode.CONFIRMATION_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.bulkOperationsService.ensureAllExist(this.userRepo, dto.ids);

    const failedIds: string[] = [];
    const activeIds: string[] = [];
    for (const id of dto.ids) {
      const user = await this.getUserOrThrow(id);
      if ((await this.isRootUser(id)) && !this.tenantContext.isRoot) {
        failedIds.push(id);
        continue;
      }
      activeIds.push(user.id);
    }

    const affected = await this.softDeleteService.softDeleteMany(
      this.userRepo,
      activeIds,
      this.actorId,
    );

    const result = this.bulkOperationsService.buildResult(
      dto.ids.length,
      affected,
      failedIds,
      'Utilisateurs supprimés en masse.',
    );
    return this.messageService.success(MessageCode.USERS_BULK_DELETED, result);
  }

  async bulkRestoreUsers(
    ids: string[],
  ): Promise<ApiResponse<BulkOperationResultDto>> {
    const validIds: string[] = [];
    for (const id of ids) {
      const deleted = await this.findScoped(id, { withDeleted: true });
      if (deleted) validIds.push(id);
    }
    const affected = await this.softDeleteService.restoreMany(
      this.userRepo,
      validIds,
    );
    const result = this.bulkOperationsService.buildResult(
      ids.length,
      affected,
      [],
      'Utilisateurs restaurés en masse.',
    );
    return this.messageService.success(MessageCode.USERS_BULK_RESTORED, result);
  }

  async bulkToggleStatus(
    dto: BulkToggleStatusDto,
  ): Promise<ApiResponse<BulkOperationResultDto>> {
    const failedIds: string[] = [];
    const validIds: string[] = [];

    for (const id of dto.ids) {
      await this.getUserOrThrow(id);
      if (!dto.actif && (await this.isRootUser(id))) {
        failedIds.push(id);
        continue;
      }
      validIds.push(id);
    }

    const affected = await this.bulkOperationsService.bulkUpdate(
      this.userRepo,
      validIds,
      { actif: dto.actif },
      this.actorId,
    );

    // Synchronisation du statut (hors comptes en attente d'activation).
    for (const id of validIds) {
      const target = await this.userRepo.findOneBy({ id });
      if (target && target.status !== UserStatus.INVITED) {
        await this.userRepo.update(
          { id },
          { status: dto.actif ? UserStatus.ACTIVE : UserStatus.DISABLED },
        );
      }
    }

    const result = this.bulkOperationsService.buildResult(
      dto.ids.length,
      affected,
      failedIds,
      'Statut mis à jour en masse.',
    );
    return this.messageService.success(MessageCode.USERS_BULK_UPDATED, result);
  }

  // ---------------------------------------------------------------------------
  // Historique de blocage
  // ---------------------------------------------------------------------------

  async getAccessLockHistory(
    userId: string,
    filter: AccessLockHistoryFilterDto,
  ): Promise<ApiResponse<PaginatedResponseDto<UserAccessLockHistory>>> {
    await this.getUserOrThrow(userId);
    const page = await this.searchService.searchAndPaginate(
      this.accessLockRepo,
      filter,
      [],
      `/api/v1/users/${userId}/access-lock-history`,
      'history',
      {
        scope: (qb) => {
          qb.andWhere('history.userId = :userId', { userId });
          if (filter.action) {
            qb.andWhere('history.action = :action', { action: filter.action });
          }
        },
      },
    );

    return this.messageService.success(
      MessageCode.USER_ACCESS_HISTORY_LIST,
      page,
    );
  }
}
