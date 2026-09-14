import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
  ) {}

  async findById(id: string): Promise<Tenant | null> {
    return this.tenantRepo.findOneBy({ id, isActive: true });
  }

  async findByCode(code: string): Promise<Tenant | null> {
    return this.tenantRepo.findOneBy({ code, isActive: true });
  }

  async findBySubdomain(subdomain: string): Promise<Tenant | null> {
    return this.tenantRepo.findOneBy({ subdomain, isActive: true });
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepo.find({ order: { nom: 'ASC' } });
  }

  async create(data: Partial<Tenant>): Promise<Tenant> {
    const tenant = this.tenantRepo.create(data);
    return this.tenantRepo.save(tenant);
  }
}
