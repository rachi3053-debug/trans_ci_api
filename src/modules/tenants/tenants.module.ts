import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantContextService } from './tenant-context.service';
import { TenantGuard } from './tenant.guard';

/**
 * Module Tenant - Multi-tenancy global.
 * Fournit TenantContextService et TenantGuard à toute l'application.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenantController],
  providers: [TenantService, TenantContextService, TenantGuard],
  exports: [TenantService, TenantContextService, TenantGuard],
})
export class TenantModule {}
