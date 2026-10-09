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
import { VilleService } from './ville.service';
import { CreateVilleDto } from './dto/create-ville.dto';
import { UpdateVilleDto } from './dto/update-ville.dto';
import { VilleSearchFilterDto } from './dto/ville-search-filter.dto';
import { Permissions } from '../auth/guards/permissions.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../audit/entities/audit-log.entity';

@ApiTags('Villes')
@ApiBearerAuth()
@Controller('villes')
export class VilleController {
  constructor(private readonly villeService: VilleService) {}

  @Get()
  @Permissions('VILLE:READ')
  @Audit(AuditAction.SEARCH)
  @ApiOperation({ summary: 'Recherche paginée des villes' })
  findAll(@Query() filter: VilleSearchFilterDto) {
    return this.villeService.findAll(filter);
  }

  @Get('deleted')
  @Permissions('VILLE:READ')
  @Audit(AuditAction.SEARCH)
  @ApiOperation({ summary: 'Liste des villes supprimées (corbeille)' })
  findDeleted(@Query() filter: VilleSearchFilterDto) {
    return this.villeService.findDeleted(filter);
  }

  @Get(':id')
  @Permissions('VILLE:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Détail d'une ville" })
  @ApiResponse({ status: 404, description: 'Ville introuvable' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.villeService.findOne(id);
  }

  @Post()
  @Permissions('VILLE:CREATE')
  @Audit(AuditAction.CREATE)
  @ApiOperation({ summary: 'Créer une ville (ROOT uniquement)' })
  @ApiResponse({ status: 201, description: 'Ville créée avec succès' })
  @ApiResponse({ status: 403, description: 'Réservé au ROOT, ou doublon' })
  @ApiResponse({ status: 409, description: 'Nom ou code déjà utilisé' })
  create(@Body() dto: CreateVilleDto) {
    return this.villeService.create(dto);
  }

  @Put(':id')
  @Permissions('VILLE:UPDATE')
  @Audit(AuditAction.UPDATE)
  @ApiOperation({ summary: 'Modifier une ville (ROOT uniquement)' })
  @ApiResponse({ status: 404, description: 'Ville introuvable' })
  @ApiResponse({ status: 409, description: 'Nom ou code déjà utilisé' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVilleDto) {
    return this.villeService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('VILLE:DELETE')
  @Audit(AuditAction.DELETE)
  @ApiOperation({
    summary: 'Supprimer une ville (ROOT uniquement, suppression logique)',
  })
  @ApiResponse({ status: 404, description: 'Ville introuvable' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.villeService.remove(id);
  }

  @Post(':id/restore')
  @Permissions('VILLE:UPDATE')
  @Audit(AuditAction.RESTORE)
  @ApiOperation({ summary: 'Restaurer une ville supprimée (ROOT uniquement)' })
  @ApiResponse({ status: 404, description: 'Ville introuvable' })
  @ApiResponse({ status: 409, description: 'Nom ou code réattribué depuis' })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.villeService.restore(id);
  }
}
