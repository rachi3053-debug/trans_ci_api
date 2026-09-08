import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignPermissionsDto {
  @ApiProperty({ example: ['USER:READ', 'USER:CREATE'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionCodes!: string[];
}
