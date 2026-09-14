import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { Role } from '../roles/entities/role.entity';
import { RolePermission } from '../roles/entities/role-permission.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtTokenType } from './strategies/jwt.strategy';
import { TokenBlacklistService } from './token-blacklist.service';
import { TenantService } from '../tenants/tenant.service';
import { TenantContextService } from '../tenants/tenant-context.service';
import { ActivationService } from './activation.service';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ApiResponse } from '../../common/responses/api-response.interface';
import { PasswordService } from '../../common/services/password.service';
import { UserStatus } from '../users/entities/user.entity';

type SafeUser = Omit<User, 'passwordHash'>;

function omitPassword(user: User): SafeUser {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(Permission)
    private permissionRepo: Repository<Permission>,
    private jwtService: JwtService,
    private config: ConfigService,
    private readonly messageService: MessageService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
    private readonly passwordService: PasswordService,
    private readonly activationService: ActivationService,
  ) {}

  async register(dto: RegisterDto): Promise<ApiResponse<SafeUser>> {
    const tenantId = this.tenantContext.tenantId;

    const existing = await this.userRepo.findOneBy({
      email: dto.email,
      tenantId: tenantId ?? undefined,
    });
    if (existing) {
      this.messageService.throwBusiness(
        MessageCode.USER_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = this.userRepo.create({
      ...dto,
      passwordHash,
      tenantId,
    });
    await this.userRepo.save(user);

    const defaultRole = await this.roleRepo.findOneBy({
      code: 'CONSULTATION',
      tenantId: tenantId ?? undefined,
    });
    if (defaultRole) {
      const ur = this.userRoleRepo.create({
        userId: user.id,
        roleId: defaultRole.id,
        tenantId,
      });
      await this.userRoleRepo.save(ur);
    }

    return this.messageService.success(
      MessageCode.USER_CREATED,
      omitPassword(user),
    );
  }

  async login(dto: LoginDto): Promise<ApiResponse<LoginResult>> {
    const user = await this.userRepo.findOneBy({ email: dto.email });
    if (!user) {
      this.messageService.throwBusiness(
        MessageCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.status === UserStatus.INVITED) {
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_ACTIVATED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!user.actif) {
      this.messageService.throwBusiness(
        MessageCode.USER_DISABLED,
        HttpStatus.FORBIDDEN,
      );
    }

    const valid = await this.passwordService.verify(
      user.passwordHash ?? '',
      dto.password,
    );
    if (!valid) {
      this.messageService.throwBusiness(
        MessageCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Vérifier si l'utilisateur est ROOT (accès global, tenant non obligatoire)
    const isRoot = await this.isUserRoot(user.id);

    let roles: string[];
    let permissions: string[];
    let tenantId: string | null = null;
    let tenantCode: string | null = null;

    if (isRoot) {
      // ROOT : accès global, toutes permissions réelles (le front les teste une à une), pas de tenant
      roles = ['ROOT'];
      permissions = await this.getAllPermissions();
    } else {
      // Utilisateur normal : tenant obligatoire.
      // Priorité au contexte (header/sous-domaine), sinon tenant du compte.
      tenantId = this.tenantContext.tenantId ?? user.tenantId;
      tenantCode = this.tenantContext.tenantCode;
      if (!tenantId) {
        this.messageService.throwBusiness(
          MessageCode.AUTH_INVALID_CREDENTIALS,
          HttpStatus.UNAUTHORIZED,
        );
      }
      const result = await this.getUserRolesAndPermissions(user.id);
      roles = result.roles;
      permissions = result.permissions;
    }

    const tokens = this.generateTokens(
      user.id,
      user.email,
      roles,
      permissions,
      tenantId,
      tenantCode,
      isRoot,
    );

    return this.messageService.success(MessageCode.AUTH_LOGIN_SUCCESS, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: omitPassword(user),
    });
  }

  /**
   * Mot de passe oublié : émet un lien de réinitialisation par email.
   * Réponse neutre dans tous les cas (pas de fuite d'existence de compte).
   * Seuls les comptes ACTIVE reçoivent réellement un lien.
   */
  async forgotPassword(email: string): Promise<ApiResponse<null>> {
    const user = await this.userRepo.findOneBy({ email });
    if (user && user.status === UserStatus.ACTIVE) {
      try {
        await this.activationService.requestPasswordReset(user);
      } catch (err) {
        // La réponse reste neutre : l'échec d'envoi (SMTP) ne doit pas révéler
        // l'existence du compte. Un renvoi de demande sera possible.
        this.logger.error(
          `Échec envoi lien de réinitialisation pour ${email}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    return this.messageService.success(
      MessageCode.PASSWORD_RESET_REQUESTED,
      null,
    );
  }

  /**
   * Finalise la réinitialisation du mot de passe oublié.
   */
  async resetPassword(
    token: string,
    password: string,
    confirmPassword: string,
  ): Promise<ApiResponse<{ id: string; email: string }>> {
    if (password !== confirmPassword) {
      this.messageService.throwBusiness(
        MessageCode.PASSWORD_MISMATCH,
        HttpStatus.BAD_REQUEST,
      );
    }
    const user = await this.activationService.resetPassword(token, password);
    return this.messageService.success(MessageCode.PASSWORD_RESET_COMPLETED, {
      id: user.id,
      email: user.email,
    });
  }

  async refresh(
    refreshToken: string,
  ): Promise<ApiResponse<{ accessToken: string }>> {
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        typ?: string;
        tenantId?: string;
        tenantCode?: string;
        isRoot?: boolean;
      }>(refreshToken, {
        secret: this.config.get<string>(
          'JWT_REFRESH_SECRET',
          'refresh-fallback',
        ),
      });

      // Vérifier que c'est bien un refresh token
      if (payload.typ !== JwtTokenType.REFRESH) {
        this.messageService.throwBusiness(
          MessageCode.AUTH_REFRESH_INVALID,
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Vérifier la blacklist
      const isBlacklisted =
        await this.tokenBlacklistService.isBlacklisted(refreshToken);
      if (isBlacklisted) {
        this.messageService.throwBusiness(
          MessageCode.AUTH_REFRESH_INVALID,
          HttpStatus.UNAUTHORIZED,
        );
      }

      const user = await this.userRepo.findOneBy({ id: payload.sub });
      if (!user || !user.actif) {
        this.messageService.throwBusiness(
          MessageCode.AUTH_REFRESH_INVALID,
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Blacklister l'ancien refresh token (rotation de sécurité)
      const decoded = this.jwtService.decode<{ exp?: number }>(refreshToken);
      const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.tokenBlacklistService.add(
        refreshToken,
        expiresAt,
        user.id,
        'refresh',
        'rotation',
      );

      const { roles, permissions } = payload.isRoot
        ? {
            roles: ['ROOT'],
            permissions: await this.getAllPermissions(),
          }
        : await this.getUserRolesAndPermissions(user.id);

      const tokens = this.generateTokens(
        user.id,
        user.email,
        roles,
        permissions,
        payload.tenantId,
        payload.tenantCode,
        payload.isRoot,
      );

      return this.messageService.success(MessageCode.AUTH_LOGIN_SUCCESS, {
        accessToken: tokens.accessToken,
      });
    } catch {
      this.messageService.throwBusiness(
        MessageCode.AUTH_REFRESH_INVALID,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async logout(token: string): Promise<ApiResponse<null>> {
    try {
      const decoded = this.jwtService.decode<{
        exp?: number;
        sub?: string;
        typ?: string;
      }>(token);
      const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 15 * 60 * 1000);

      const tokenType =
        decoded?.typ === JwtTokenType.REFRESH ? 'refresh' : 'access';

      await this.tokenBlacklistService.add(
        token,
        expiresAt,
        decoded?.sub,
        tokenType,
        'logout',
      );
    } catch {
      // Même si le token est invalide, on retourne succès (logout best-effort)
    }

    // Nettoyer les entrées expirées en arrière-plan
    this.tokenBlacklistService.cleanExpired().catch(() => {});

    return this.messageService.success(MessageCode.AUTH_LOGIN_SUCCESS, null);
  }

  async getMe(userId: string): Promise<ApiResponse<SafeUser>> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.messageService.success(
      MessageCode.AUTH_LOGIN_SUCCESS,
      omitPassword(user),
    );
  }

  async getUserRolesAndPermissions(
    userId: string,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    const userRoles = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });

    const roleIds = userRoles.map((ur) => ur.roleId);
    const roleCodes = userRoles.map((ur) => ur.role.code);

    if (roleIds.length === 0) {
      return { roles: roleCodes, permissions: [] };
    }

    const rolePermissions = await this.rolePermissionRepo.find({
      where: roleIds.map((roleId) => ({ roleId })),
      relations: ['permission'],
    });

    const permissionCodes = [
      ...new Set(rolePermissions.map((rp) => rp.permission.code)),
    ];

    return { roles: roleCodes, permissions: permissionCodes };
  }

  /**
   * Vérifie si un utilisateur est porteur du rôle ROOT (système global).
   * NB : aucun filtre tenant — le rôle ROOT est stocké avec tenant_id NULL.
   */
  private async isUserRoot(userId: string): Promise<boolean> {
    const rootRole = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'role', 'role.code = :code', { code: 'ROOT' })
      .where('ur.userId = :userId', { userId })
      .getOne();
    return !!rootRole;
  }

  /**
   * Liste de TOUS les codes de permission de l'application (pour le ROOT).
   * Le front teste chaque code individuellement : le ROOT doit donc recevoir
   * la liste complète plutôt qu'un wildcard qu'aucun client ne sait interpréter.
   */
  private async getAllPermissions(): Promise<string[]> {
    const permissions = await this.permissionRepo.find();
    return [...new Set(permissions.map((p) => p.code))];
  }

  /**
   * Génère les tokens access et refresh avec le champ `typ` et les infos tenant.
   */
  private generateTokens(
    userId: string,
    email: string,
    roles: string[],
    permissions: string[],
    tenantId?: string | null,
    tenantCode?: string | null,
    isRoot?: boolean,
  ): { accessToken: string; refreshToken: string } {
    const basePayload = {
      sub: userId,
      email,
      roles,
      permissions,
      tenantId: tenantId ?? undefined,
      tenantCode: tenantCode ?? undefined,
      isRoot: isRoot ?? false,
    };

    const accessToken = this.jwtService.sign({
      ...basePayload,
      typ: JwtTokenType.ACCESS,
    });

    const refreshToken = this.jwtService.sign(
      {
        ...basePayload,
        typ: JwtTokenType.REFRESH,
      },
      {
        expiresIn: this.config.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '7d',
        ) as StringValue,
        secret: this.config.get<string>(
          'JWT_REFRESH_SECRET',
          'refresh-fallback',
        ),
      },
    );

    return { accessToken, refreshToken };
  }
}
