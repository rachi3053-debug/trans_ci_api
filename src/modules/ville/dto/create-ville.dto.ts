import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Longueur maximale commune aux champs textuels courts de la ville.
 * Au-delà, la saisie est presque systématiquement une erreur.
 */
const MAX_LEN_COURT = 100;

/**
 * Code court d'une ville : lettres non accentuées, chiffres, tiret et
 * underscore. La casse est normalisée en majuscules par le service
 * (`VilleService.normalizeCode`), la base Compare via `LOWER(code)`.
 */
const CODE_VILLE_PATTERN = /^[A-Za-z0-9_-]+$/;

export class CreateVilleDto {
  @ApiProperty({ example: 'Abidjan', maxLength: MAX_LEN_COURT })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LEN_COURT)
  nom!: string;

  @ApiProperty({
    example: 'ABI',
    description:
      'Code court unique, insensible à la casse. Normalisé en majuscules.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(20)
  @Matches(CODE_VILLE_PATTERN, {
    message:
      'Le code ne peut contenir que des lettres non accentuées, des chiffres, des tirets et des underscores.',
  })
  code!: string;

  @ApiPropertyOptional({ example: 'Région des Lagunes' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEN_COURT)
  region?: string;

  @ApiPropertyOptional({ example: "Département d'Abidjan" })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LEN_COURT)
  departement?: string;

  @ApiPropertyOptional({ example: 'BP 2000' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codePostal?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Par défaut `true`. Une ville inactive reste consultable.',
  })
  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
