import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BaseSearchFilterDto } from '../../../common/dto/base-search-filter.dto';
import { AccessLockAction } from '../entities/user-access-lock-history.entity';

/**
 * DTO de blocage d'un compte utilisateur.
 */
export class AccessLockDto {
  @ApiPropertyOptional({
    description: 'Motif du blocage',
    example: 'Tentative de connexion suspecte',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Filtres pour l'historique des blocages/déblocages d'un compte.
 */
export class AccessLockHistoryFilterDto extends BaseSearchFilterDto {
  @ApiPropertyOptional({
    description: "Filtrer par type d'événement",
    enum: AccessLockAction,
  })
  @IsOptional()
  @IsEnum(AccessLockAction)
  action?: AccessLockAction;
}
