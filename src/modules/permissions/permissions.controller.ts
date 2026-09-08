import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
import { Permissions } from '../auth/guards/permissions.decorator';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Permissions('PERMISSION:READ')
  @ApiOperation({ summary: 'Liste des permissions' })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get(':id')
  @Permissions('PERMISSION:READ')
  @ApiOperation({ summary: "Détail d'une permission" })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.findOne(id);
  }

  @Post()
  @Permissions('PERMISSION:CREATE')
  @ApiOperation({ summary: 'Créer une permission' })
  @ApiResponse({ status: 201, description: 'Permission créée' })
  @ApiResponse({ status: 409, description: 'Code déjà utilisé' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @Put(':id')
  @Permissions('PERMISSION:UPDATE')
  @ApiOperation({ summary: 'Modifier une permission' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('PERMISSION:DELETE')
  @ApiOperation({ summary: 'Supprimer une permission' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.remove(id);
  }
}
