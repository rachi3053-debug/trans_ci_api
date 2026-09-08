import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ApiResponse } from '../../common/responses/api-response.interface';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(Permission)
    private permissionRepo: Repository<Permission>,
    private readonly messageService: MessageService,
  ) {}

  async findAll(): Promise<ApiResponse<Role[]>> {
    const roles = await this.roleRepo.find({ order: { code: 'ASC' } });
    return this.messageService.success(MessageCode.ROLE_LIST, roles);
  }

  async findOne(id: string): Promise<ApiResponse<Role>> {
    const role = await this.roleRepo.findOneBy({ id });
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.messageService.success(MessageCode.ROLE_LIST, role);
  }

  async findByCode(code: string): Promise<Role> {
    const role = await this.roleRepo.findOneBy({ code });
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return role;
  }

  async create(dto: CreateRoleDto): Promise<ApiResponse<Role>> {
    const existing = await this.roleRepo.findOneBy({ code: dto.code });
    if (existing) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }
    const role = this.roleRepo.create(dto);
    const saved = await this.roleRepo.save(role);
    return this.messageService.success(MessageCode.ROLE_CREATED, saved);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<ApiResponse<Role>> {
    const role = await this.roleRepo.findOneBy({ id });
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.code && dto.code !== role.code) {
      const existing = await this.roleRepo.findOneBy({ code: dto.code });
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
    const role = await this.roleRepo.findOneBy({ id });
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    await this.rolePermissionRepo.delete({ roleId: id });
    await this.roleRepo.remove(role);

    return this.messageService.success(MessageCode.ROLE_DELETED, null);
  }

  async assignPermissions(
    id: string,
    dto: AssignPermissionsDto,
  ): Promise<ApiResponse<Role>> {
    const role = await this.roleRepo.findOneBy({ id });
    if (!role) {
      this.messageService.throwBusiness(
        MessageCode.ROLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    await this.rolePermissionRepo.delete({ roleId: id });

    for (const permCode of dto.permissionCodes) {
      const permission = await this.permissionRepo.findOneBy({
        code: permCode,
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
      });
      await this.rolePermissionRepo.save(rp);
    }

    return this.messageService.success(
      MessageCode.ROLE_PERMISSIONS_UPDATED,
      role,
    );
  }

  async getRolePermissions(roleId: string): Promise<ApiResponse<Permission[]>> {
    const rolePermissions = await this.rolePermissionRepo.find({
      where: { roleId },
      relations: ['permission'],
    });
    return this.messageService.success(
      MessageCode.PERMISSION_LIST,
      rolePermissions.map((rp) => rp.permission),
    );
  }
}
