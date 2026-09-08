import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import { Role } from '../roles/entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ApiResponse } from '../../common/responses/api-response.interface';

type SafeUser = Omit<User, 'passwordHash'>;

function omitPassword(user: User): SafeUser {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    private readonly messageService: MessageService,
  ) {}

  async findAll(): Promise<ApiResponse<SafeUser[]>> {
    const users = await this.userRepo.find({ order: { createdAt: 'DESC' } });
    return this.messageService.success(
      MessageCode.USER_LIST,
      users.map(omitPassword),
    );
  }

  async findOne(id: string): Promise<ApiResponse<SafeUser>> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.messageService.success(MessageCode.USER_LIST, omitPassword(user));
  }

  async create(dto: CreateUserDto): Promise<ApiResponse<SafeUser>> {
    const existing = await this.userRepo.findOneBy({ email: dto.email });
    if (existing) {
      this.messageService.throwBusiness(
        MessageCode.USER_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({ ...dto, passwordHash });
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

  async update(
    id: string,
    dto: UpdateUserDto,
  ): Promise<ApiResponse<SafeUser>> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepo.findOneBy({ email: dto.email });
      if (existing) {
        this.messageService.throwBusiness(
          MessageCode.USER_ALREADY_EXISTS,
          HttpStatus.CONFLICT,
        );
      }
    }

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    Object.assign(user, dto);
    await this.userRepo.save(user);

    return this.messageService.success(
      MessageCode.USER_UPDATED,
      omitPassword(user),
    );
  }

  async remove(id: string): Promise<ApiResponse<null>> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    await this.userRoleRepo.delete({ userId: id });
    await this.userRepo.remove(user);

    return this.messageService.success(MessageCode.USER_DELETED, null);
  }

  async assignRoles(
    id: string,
    dto: AssignRolesDto,
  ): Promise<ApiResponse<SafeUser>> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      this.messageService.throwBusiness(
        MessageCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    await this.userRoleRepo.delete({ userId: id });

    for (const roleCode of dto.roleCodes) {
      const role = await this.roleRepo.findOneBy({ code: roleCode });
      if (!role) {
        this.messageService.throwBusiness(
          MessageCode.ROLE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      const ur = this.userRoleRepo.create({ userId: id, roleId: role.id });
      await this.userRoleRepo.save(ur);
    }

    return this.messageService.success(
      MessageCode.USER_ROLES_UPDATED,
      omitPassword(user),
    );
  }

  async getUserRoles(userId: string): Promise<ApiResponse<Role[]>> {
    const userRoles = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });
    return this.messageService.success(
      MessageCode.USER_LIST,
      userRoles.map((ur) => ur.role),
    );
  }
}
