import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResponseDto } from '../../common/responses/paginated-response.dto';
import { PaginationService } from '../../common/services/pagination.service';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ApiResponse } from '../../common/responses/api-response.interface';
import { TenantContextService } from '../tenants/tenant-context.service';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(Permission)
    private permissionRepo: Repository<Permission>,
    private readonly messageService: MessageService,
    private readonly paginationService: PaginationService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findAll(
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<Role>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const qb = this.roleRepo
      .createQueryBuilder('role')
      .where('role.deletedAt IS NULL');

    // ROOT : accès à tous les rôles de tous les tenants. Sinon : filter par tenant.
    if (!isRoot && tenantId) {
      qb.andWhere('role.tenantId = :tenantId', { tenantId });
    }

    qb.orderBy('role.code', 'ASC');

    return this.paginationService.paginate(qb, pagination, '/api/v1/roles');
  }

  async findOne(id: string): Promise<ApiResponse<Role>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { id };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const role = await this.roleRepo.findOneBy(where);
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.messageService.success(MessageCode.ROLE_LIST, role);
  }

  async findByCode(code: string): Promise<Role> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { code };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const role = await this.roleRepo.findOneBy(where);
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return role;
  }

  async create(dto: CreateRoleDto): Promise<ApiResponse<Role>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { code: dto.code };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const existing = await this.roleRepo.findOneBy(where);
    if (existing) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }
    const role = this.roleRepo.create({ ...dto, tenantId });
    const saved = await this.roleRepo.save(role);
    return this.messageService.success(MessageCode.ROLE_CREATED, saved);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<ApiResponse<Role>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { id };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const role = await this.roleRepo.findOneBy(where);
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.code && dto.code !== role.code) {
      const checkWhere: Record<string, unknown> = { code: dto.code };
      if (!isRoot && tenantId) {
        checkWhere.tenantId = tenantId;
      }
      const existing = await this.roleRepo.findOneBy(checkWhere);
      if (existing) {
        this.messageService.throwBusiness(
          MessageCode.ROLE_ALREADY_EXISTS,
          HttpStatus.CONFLICT,
        );
      }
    }

    Object.assign(role, dto);
    const saved = await this.roleRepo.save(role);
    return this.messageService.success(MessageCode.ROLE_UPDATED, saved);
  }

  async remove(id: string): Promise<ApiResponse<null>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { id };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const role = await this.roleRepo.findOneBy(where);
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    role.deletedAt = new Date();
    await this.roleRepo.save(role);

    return this.messageService.success(MessageCode.ROLE_DELETED, null);
  }

  async assignPermissions(
    id: string,
    dto: AssignPermissionsDto,
  ): Promise<ApiResponse<Role>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { id };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const role = await this.roleRepo.findOneBy(where);
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    // Le rôle ciblé est déjà validé dans le tenant courant (non-ROOT) :
    // on retire ses liens sans filtre tenant supplémentaire.
    await this.rolePermissionRepo.delete({ roleId: id });

    for (const permCode of dto.permissionCodes) {
      const permission = await this.permissionRepo.findOneBy({
        code: permCode,
        tenantId: tenantId ?? undefined,
      });
      if (!permission) {
        this.messageService.throwBusiness(
          MessageCode.PERMISSION_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const rp = this.rolePermissionRepo.create({
        roleId: id,
        permissionId: permission.id,
        tenantId,
      });
      await this.rolePermissionRepo.save(rp);
    }

    return this.messageService.success(
      MessageCode.ROLE_PERMISSIONS_UPDATED,
      role,
    );
  }

  async getRolePermissions(roleId: string): Promise<ApiResponse<Permission[]>> {
    const isRoot = this.tenantContext.isRoot;
    const tenantId = this.tenantContext.tenantId;

    const where: Record<string, unknown> = { roleId };
    if (!isRoot && tenantId) {
      where.tenantId = tenantId;
    }

    const rolePermissions = await this.rolePermissionRepo.find({
      where,
      relations: ['permission'],
    });
    return this.messageService.success(
      MessageCode.PERMISSION_LIST,
      rolePermissions.map((rp) => rp.permission),
    );
  }
}
