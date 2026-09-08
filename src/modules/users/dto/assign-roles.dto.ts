import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRolesDto {
  @ApiProperty({ example: ['ADMIN', 'OPERATEUR'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleCodes!: string[];
}
