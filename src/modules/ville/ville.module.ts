import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ville } from './entities/ville.entity';
import { VilleService } from './ville.service';
import { VilleController } from './ville.controller';

/**
 * Module de gestion des villes (référence globale).
 *
 * Le service est exporté afin que les modules métier à venir (gares, trajets,
 * chauffeurs) puissent résoudre une ville par son code sans repasser par HTTP.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Ville])],
  controllers: [VilleController],
  providers: [VilleService],
  exports: [VilleService],
})
export class VilleModule {}
