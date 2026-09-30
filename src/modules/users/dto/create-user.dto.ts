import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @IsNotEmpty()
  nom!: string;

  @ApiProperty({ example: 'Jean' })
  @IsString()
  @IsNotEmpty()
  prenom!: string;

  @ApiProperty({ example: 'jean.dupont@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+221 77 123 45 67' })
  @IsOptional()
  @IsString()
  telephone?: string;

  @ApiPropertyOptional({
    example: 'MotDePasse123!',
    description:
      "Mot de passe initial (optionnel). S'il est absent, l'utilisateur est créé en statut INVITED et reçoit un email d'invitation pour définir lui-même son mot de passe.",
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    example: 'OPERATEUR',
    description:
      'Code du rôle à assigner à la création. Sans valeur, le rôle CONSULTATION est attribué par défaut.',
  })
  @IsOptional()
  @IsString()
  roleCode?: string;

  @ApiPropertyOptional({
    example: '45a...',
    description:
      'Tenant de destination (réservé au ROOT). Sans valeur, le tenant courant est utilisé.',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
