import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../auth/guards/permissions.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../audit/entities/audit-log.entity';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('ROLE:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: 'Liste des rôles (paginée)' })
  findAll(@Query() pagination: PaginationDto) {
    return this.rolesService.findAll(pagination);
  }

  @Get(':id')
  @Permissions('ROLE:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Détail d'un rôle" })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @Permissions('ROLE:CREATE')
  @Audit(AuditAction.CREATE)
  @ApiOperation({ summary: 'Créer un rôle' })
  @ApiResponse({ status: 201, description: 'Rôle créé' })
  @ApiResponse({ status: 409, description: 'Code déjà utilisé' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Put(':id')
  @Permissions('ROLE:UPDATE')
  @Audit(AuditAction.UPDATE)
  @ApiOperation({ summary: 'Modifier un rôle' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('ROLE:DELETE')
  @Audit(AuditAction.DELETE)
  @ApiOperation({ summary: 'Supprimer un rôle (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.remove(id);
  }

  @Post(':id/permissions')
  @Permissions('ROLE:UPDATE')
  @Audit(AuditAction.UPDATE)
  @ApiOperation({ summary: 'Assigner des permissions à un rôle' })
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.rolesService.assignPermissions(id, dto);
  }

  @Get(':id/permissions')
  @Permissions('ROLE:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Permissions d'un rôle" })
  getRolePermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.getRolePermissions(id);
  }
}
