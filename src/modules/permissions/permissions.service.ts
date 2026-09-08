import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ApiResponse } from '../../common/responses/api-response.interface';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private permissionRepo: Repository<Permission>,
    private readonly messageService: MessageService,
  ) {}

  async findAll(): Promise<ApiResponse<Permission[]>> {
    const perms = await this.permissionRepo.find({
      order: { module: 'ASC', action: 'ASC' },
    });
    return this.messageService.success(MessageCode.PERMISSION_LIST, perms);
  }

  async findOne(id: string): Promise<ApiResponse<Permission>> {
    const perm = await this.permissionRepo.findOneBy({ id });
    if (!perm) {
      this.messageService.throwBusiness(
        MessageCode.PERMISSION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.messageService.success(MessageCode.PERMISSION_LIST, perm);
  }

  async create(dto: CreatePermissionDto): Promise<ApiResponse<Permission>> {
    const existing = await this.permissionRepo.findOneBy({ code: dto.code });
    if (existing) {
      this.messageService.throwBusiness(
        MessageCode.PERMISSION_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }
    const perm = this.permissionRepo.create(dto);
    const saved = await this.permissionRepo.save(perm);
    return this.messageService.success(MessageCode.PERMISSION_CREATED, saved);
  }

  async update(
    id: string,
    dto: UpdatePermissionDto,
  ): Promise<ApiResponse<Permission>> {
    const perm = await this.permissionRepo.findOneBy({ id });
    if (!perm) {
      this.messageService.throwBusiness(
        MessageCode.PERMISSION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.code && dto.code !== perm.code) {
      const existing = await this.permissionRepo.findOneBy({ code: dto.code });
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
    const perm = await this.permissionRepo.findOneBy({ id });
    if (!perm) {
      this.messageService.throwBusiness(
        MessageCode.PERMISSION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    await this.permissionRepo.remove(perm);

    return this.messageService.success(MessageCode.PERMISSION_DELETED, null);
  }
}
