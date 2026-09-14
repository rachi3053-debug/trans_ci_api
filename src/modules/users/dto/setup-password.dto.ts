import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Types de mise à jour de mot de passe.
 * - set-password : un admin/root définit un nouveau mot de passe
 * - reset-password : un admin/root réinitialise (mot de passe provisoire si absent)
 * - first-login : l'utilisateur change son mot de passe provisoire lors de sa 1ère connexion
 */
export enum PasswordAction {
  SET_PASSWORD = 'set-password',
  RESET_PASSWORD = 'reset-password',
  FIRST_LOGIN = 'first-login',
}

/**
 * DTO de mise en place / réinitialisation du mot de passe.
 */
export class SetupPasswordDto {
  @ApiPropertyOptional({
    description:
      'Nouveau mot de passe (min 8 caractères). Optionnel pour reset-password : un mot de passe provisoire est alors généré.',
    example: 'NouveauMdp123!',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({
    description: "Type d'action sur le mot de passe",
    enum: PasswordAction,
    example: PasswordAction.RESET_PASSWORD,
  })
  @IsEnum(PasswordAction)
  passwordAction!: PasswordAction;

  @ApiPropertyOptional({
    description: 'Force le changement de mot de passe à la prochaine connexion',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  firstconnexion?: boolean;
}
