import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ActivateAccountDto {
  @ApiProperty({ description: "Jeton d'invitation reçu par email" })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ description: "Mot de passe choisi par l'utilisateur" })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre.',
  })
  password!: string;

  @ApiProperty({ description: 'Confirmation du mot de passe' })
  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}
