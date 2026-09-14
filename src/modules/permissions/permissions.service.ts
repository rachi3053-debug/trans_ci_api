import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResponseDto } from '../../common/responses/paginated-response.dto';
import { PaginationService } from '../../common/services/pagination.service';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ApiResponse } from '../../common/responses/api-response.interface';
import { TenantContextService } from '../tenants/tenant-context.service';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepo: Repository<Permission>,
    private readonly messageService: MessageService,
    private readonly paginationService: PaginationService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll(
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<Permission>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const qb = this.permissionRepo
      .createQueryBuilder('permission')
      .where('permission.deletedAt IS NULL');

    // ROOT : accès à toutes les permissions de tous les tenants. Sinon : filter par tenant.
    if (!isRoot && tenantId) {
      qb.andWhere('permission.tenantId = :tenantId', { tenantId });
    }

    qb.orderBy('permission.module', 'ASC').addOrderBy(
      'permission.action',
      'ASC',
    );

    return this.paginationService.paginate(
      qb,
      pagination,
      '/api/v1/permissions',
    );
  }

  async findOne(id: string): Promise<ApiResponse<Permission>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { id };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const perm = await this.permissionRepo.findOneBy(where);
    if (!perm) {
      this.messageService.throwBusiness(
        MessageCode.PERMISSION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.messageService.success(MessageCode.PERMISSION_LIST, perm);
  }

  async create(dto: CreatePermissionDto): Promise<ApiResponse<Permission>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { code: dto.code };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const existing = await this.permissionRepo.findOneBy(where);
    if (existing) {
      this.messageService.throwBusiness(
        MessageCode.PERMISSION_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }
    const perm = this.permissionRepo.create({ ...dto, tenantId });
    const saved = await this.permissionRepo.save(perm);
    return this.messageService.success(MessageCode.PERMISSION_CREATED, saved);
  }

  async update(
    id: string,
    dto: UpdatePermissionDto,
  ): Promise<ApiResponse<Permission>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { id };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const perm = await this.permissionRepo.findOneBy(where);
    if (!perm) {
      this.messageService.throwBusiness(
        MessageCode.PERMISSION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.code && dto.code !== perm.code) {
      const checkWhere: Record<string, unknown> = { code: dto.code };
      if (!isRoot && tenantId) {
        checkWhere.tenantId = tenantId;
      }
      const existing = await this.permissionRepo.findOneBy(checkWhere);
      if (existing) {
        this.messageService.throwBusiness(
          MessageCode.PERMISSION_ALREADY_EXISTS,
          HttpStatus.CONFLICT,
        );
      }
    }

    Object.assign(perm, dto);
    const saved = await this.permissionRepo.save(perm);
    return this.messageService.success(MessageCode.PERMISSION_UPDATED, saved);
  }

  async remove(id: string): Promise<ApiResponse<null>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { id };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const perm = await this.permissionRepo.findOneBy(where);
    if (!perm) {
      this.messageService.throwBusiness(
        MessageCode.PERMISSION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    perm.deletedAt = new Date();
    await this.permissionRepo.save(perm);

    return this.messageService.success(MessageCode.PERMISSION_DELETED, null);
  }
}
