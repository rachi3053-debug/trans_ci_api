import { PartialType } from '@nestjs/swagger';
import { CreateVilleDto } from './create-ville.dto';

/**
 * Mise à jour d'une ville : tous les champs de création deviennent facultatifs.
 *
 * `actif` reste modifiable indépendamment de `deletedAt` : désactiver une ville
 * la retire des listes par défaut sans la supprimer, ce qui préserve les
 * références métier (gares, trajets).
 */
export class UpdateVilleDto extends PartialType(CreateVilleDto) {}
