import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { Public } from '../auth/guards/public.decorator';
import { NoTenant } from './decorators/no-tenant.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../audit/entities/audit-log.entity';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @NoTenant()
  @Get()
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: 'Liste des tenants actifs' })
  findAll() {
    return this.tenantService.findAll();
  }

  @NoTenant()
  @Get(':id')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Détail d'un tenant" })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantService.findById(id);
  }

  @NoTenant()
  @Post()
  @Audit(AuditAction.CREATE)
  @ApiOperation({ summary: 'Créer un tenant' })
  create(@Body() data: { code: string; nom: string; subdomain?: string }) {
    return this.tenantService.create(data);
  }
}
