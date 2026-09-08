import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'node:crypto';
import { ApiKey } from './entities/api-key.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.entity';
import { RolePermission } from '../roles/entities/role-permission.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ApiResponse } from '../../common/responses/api-response.interface';

const KEY_PREFIX = 'sk_live_';
const KEY_BYTES = 32;

export interface CreatedApiKey {
  id: string;
  name: string;
  apiKey: string;
  expiresAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey) private apiKeyRepo: Repository<ApiKey>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @InjectRepository(RolePermission)
    private rolePermissionRepo: Repository<RolePermission>,
    private readonly messageService: MessageService,
  ) {}

  async create(
    dto: CreateApiKeyDto,
    userId: string,
  ): Promise<ApiResponse<CreatedApiKey>> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    const plainKey = KEY_PREFIX + randomBytes(KEY_BYTES).toString('hex');
    const keyHash = createHash('sha256').update(plainKey).digest('hex');
    const keyPrefix = plainKey.substring(0, KEY_PREFIX.length + 8);

    const apiKey = this.apiKeyRepo.create({
      name: dto.name,
      keyPrefix,
      keyHash,
      userId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      actif: true,
    });

    await this.apiKeyRepo.save(apiKey);

    return this.messageService.success(MessageCode.API_KEY_CREATED, {
      id: apiKey.id,
      name: apiKey.name,
      apiKey: plainKey,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    });
  }

  async findAll(
    userId: string,
  ): Promise<ApiResponse<Omit<ApiKey, 'keyHash'>[]>> {
    const keys = await this.apiKeyRepo.find({
      where: { userId },
      select: [
        'id',
        'name',
        'keyPrefix',
        'userId',
        'expiresAt',
        'lastUsedAt',
        'actif',
        'createdAt',
        'revokedAt',
      ],
      order: { createdAt: 'DESC' },
    });
    return this.messageService.success(MessageCode.API_KEY_LIST, keys);
  }

  async revoke(id: string, userId: string): Promise<ApiResponse<null>> {
    const key = await this.apiKeyRepo.findOneBy({ id, userId });
    if (!key) {
      this.messageService.throwBusiness(
        MessageCode.API_KEY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    key.actif = false;
    key.revokedAt = new Date();
    await this.apiKeyRepo.save(key);

    return this.messageService.success(MessageCode.API_KEY_REVOKED, null);
  }

  async validateApiKey(plainKey: string): Promise<{
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
  } | null> {
    const keyPrefix = plainKey.substring(0, KEY_PREFIX.length + 8);
    const keyHash = createHash('sha256').update(plainKey).digest('hex');

    const apiKey = await this.apiKeyRepo.findOne({
      where: { keyPrefix, keyHash, actif: true },
      relations: ['user'],
    });

    if (!apiKey) return null;

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return null;
    }

    apiKey.lastUsedAt = new Date();
    await this.apiKeyRepo.save(apiKey);

    const userRoles = await this.userRoleRepo.find({
      where: { userId: apiKey.userId },
      relations: ['role'],
    });

    const roleIds = userRoles.map((ur) => ur.roleId);
    const roleCodes = userRoles.map((ur) => ur.role.code);

    const rolePermissions = await this.rolePermissionRepo.find({
      where: roleIds.map((roleId) => ({ roleId })),
      relations: ['permission'],
    });

    const permissionCodes = [
      ...new Set(rolePermissions.map((rp) => rp.permission.code)),
    ];

    return {
      id: apiKey.user.id,
      email: apiKey.user.email,
      roles: roleCodes,
      permissions: permissionCodes,
    };
  }
}
