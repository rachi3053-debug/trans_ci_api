import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { Permissions } from '../auth/guards/permissions.decorator';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @Permissions('USER:CREATE')
  @ApiOperation({ summary: 'Créer une clé API' })
  @ApiResponse({
    status: 201,
    description: 'Clé créée (affichée une seule fois)',
  })
  create(@Body() dto: CreateApiKeyDto, @CurrentUser() user: { id: string }) {
    return this.apiKeysService.create(dto, user.id);
  }

  @Get()
  @Permissions('USER:READ')
  @ApiOperation({ summary: "Lister les clés API de l'utilisateur" })
  findAll(@CurrentUser() user: { id: string }) {
    return this.apiKeysService.findAll(user.id);
  }

  @Delete(':id')
  @Permissions('USER:DELETE')
  @ApiOperation({ summary: 'Révoquer une clé API' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.apiKeysService.revoke(id, user.id);
  }
}
