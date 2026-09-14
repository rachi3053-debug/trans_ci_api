import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../modules/auth/guards/public.decorator';
import { NoTenant } from '../modules/tenants/decorators/no-tenant.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @NoTenant()
  @Get()
  @ApiOperation({ summary: 'Statut du service' })
  getStatus(): { status: string; service: string } {
    return { status: 'ok', service: 'transci-ci-api' };
  }

  @Public()
  @NoTenant()
  @Get('db')
  @ApiOperation({ summary: 'Statut de la connexion base de données' })
  async getDatabaseStatus(): Promise<{ status: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
      });
    }
  }
}
