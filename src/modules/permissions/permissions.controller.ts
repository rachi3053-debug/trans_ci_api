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
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Permissions } from '../auth/guards/permissions.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../audit/entities/audit-log.entity';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Permissions('PERMISSION:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: 'Liste des permissions (paginée)' })
  findAll(@Query() pagination: PaginationDto) {
    return this.permissionsService.findAll(pagination);
  }

  @Get(':id')
  @Permissions('PERMISSION:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Détail d'une permission" })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.findOne(id);
  }

  @Post()
  @Permissions('PERMISSION:CREATE')
  @Audit(AuditAction.CREATE)
  @ApiOperation({ summary: 'Créer une permission' })
  @ApiResponse({ status: 201, description: 'Permission créée' })
  @ApiResponse({ status: 409, description: 'Code déjà utilisé' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @Put(':id')
  @Permissions('PERMISSION:UPDATE')
  @Audit(AuditAction.UPDATE)
  @ApiOperation({ summary: 'Modifier une permission' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('PERMISSION:DELETE')
  @Audit(AuditAction.DELETE)
  @ApiOperation({ summary: 'Supprimer une permission (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.remove(id);
  }
}
