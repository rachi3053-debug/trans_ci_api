import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { Role } from '../roles/entities/role.entity';
import { RolePermission } from '../roles/entities/role-permission.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ApiResponse } from '../../common/responses/api-response.interface';

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
  ) {}

  async register(dto: RegisterDto): Promise<ApiResponse<SafeUser>> {
    const existing = await this.userRepo.findOneBy({ email: dto.email });
    if (existing) {
      this.messageService.throwBusiness(
        MessageCode.USER_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepo.create({
      ...dto,
      passwordHash,
    });
    await this.userRepo.save(user);

    const defaultRole = await this.roleRepo.findOneBy({ code: 'CONSULTATION' });
    if (defaultRole) {
      const ur = this.userRoleRepo.create({
        userId: user.id,
        roleId: defaultRole.id,
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

    if (!user.actif) {
      this.messageService.throwBusiness(
        MessageCode.USER_DISABLED,
        HttpStatus.FORBIDDEN,
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      this.messageService.throwBusiness(
        MessageCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const { roles, permissions } = await this.getUserRolesAndPermissions(
      user.id,
    );

    const payload = {
      sub: user.id,
      email: user.email,
      roles,
      permissions,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get<string>(
        'JWT_REFRESH_EXPIRES_IN',
        '7d',
      ) as StringValue,
      secret: this.config.get<string>('JWT_REFRESH_SECRET', 'refresh-fallback'),
    });

    return this.messageService.success(MessageCode.AUTH_LOGIN_SUCCESS, {
      accessToken,
      refreshToken,
      user: omitPassword(user),
    });
  }

  async refresh(refreshToken: string): Promise<ApiResponse<{ accessToken: string }>> {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(refreshToken, {
        secret: this.config.get<string>(
          'JWT_REFRESH_SECRET',
          'refresh-fallback',
        ),
      });

      const user = await this.userRepo.findOneBy({ id: payload.sub });
      if (!user || !user.actif) {
        this.messageService.throwBusiness(
          MessageCode.AUTH_REFRESH_INVALID,
          HttpStatus.UNAUTHORIZED,
        );
      }

      const { roles, permissions } = await this.getUserRolesAndPermissions(
        user.id,
      );

      return this.messageService.success(MessageCode.AUTH_LOGIN_SUCCESS, {
        accessToken: this.jwtService.sign({
          sub: user.id,
          email: user.email,
          roles,
          permissions,
        }),
      });
    } catch {
      this.messageService.throwBusiness(
        MessageCode.AUTH_REFRESH_INVALID,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async getMe(userId: string): Promise<ApiResponse<SafeUser>> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.messageService.success(MessageCode.AUTH_LOGIN_SUCCESS, omitPassword(user));
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
}
