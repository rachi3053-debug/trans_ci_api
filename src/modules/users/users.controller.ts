import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { RemoveRolesDto } from './dto/remove-roles.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import {
  AccessLockDto,
  AccessLockHistoryFilterDto,
} from './dto/access-lock.dto';
import { UserSearchFilterDto } from './dto/user-search-filter.dto';
import {
  BulkAssignRolesDto,
  BulkByIdsDto,
  BulkDeleteDto,
  BulkToggleStatusDto,
} from '../../common/dto/bulk-operations.dto';
import { Permissions } from '../auth/guards/permissions.decorator';
import { Audit, AuditSkip } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../audit/entities/audit-log.entity';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('USER:READ')
  @Audit(AuditAction.SEARCH)
  @ApiOperation({ summary: 'Recherche paginée des utilisateurs' })
  findAll(@Query() filter: UserSearchFilterDto) {
    return this.usersService.findAll(filter);
  }

  @Get('deleted')
  @Permissions('USER:READ')
  @Audit(AuditAction.SEARCH)
  @ApiOperation({ summary: 'Liste des utilisateurs supprimés (corbeille)' })
  findDeletedUsers(@Query() filter: UserSearchFilterDto) {
    return this.usersService.findDeletedUsers(filter);
  }

  @Post('bulk/assign-roles')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.BULK_UPDATE)
  @ApiOperation({ summary: 'Assigner des rôles à plusieurs utilisateurs' })
  bulkAssignRoles(@Body() dto: BulkAssignRolesDto) {
    return this.usersService.bulkAssignRoles(dto);
  }

  @Delete('bulk/remove-roles')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.BULK_UPDATE)
  @ApiOperation({ summary: 'Retirer des rôles à plusieurs utilisateurs' })
  bulkRemoveRoles(@Body() dto: BulkAssignRolesDto) {
    return this.usersService.bulkRemoveRoles(dto);
  }

  @Post('bulk/delete')
  @Permissions('USER:DELETE')
  @Audit(AuditAction.BULK_DELETE)
  @ApiOperation({
    summary: 'Suppression logique en masse (confirmation requise)',
  })
  bulkSoftDelete(@Body() dto: BulkDeleteDto) {
    return this.usersService.softDeleteManyUsers(dto);
  }

  @Post('bulk/restore')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.RESTORE)
  @ApiOperation({ summary: 'Restaurer plusieurs utilisateurs supprimés' })
  bulkRestore(@Body() dto: BulkByIdsDto) {
    return this.usersService.bulkRestoreUsers(dto.ids);
  }

  @Post('bulk/status')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.BULK_UPDATE)
  @ApiOperation({ summary: 'Activer/désactiver plusieurs utilisateurs' })
  bulkToggleStatus(@Body() dto: BulkToggleStatusDto) {
    return this.usersService.bulkToggleStatus(dto);
  }

  @Get(':id')
  @Permissions('USER:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Détail d'un utilisateur" })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id/deleted')
  @Permissions('USER:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Détail d'un utilisateur (y compris supprimé)" })
  findUserWithDeleted(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findUserWithDeleted(id);
  }

  @Post()
  @Permissions('USER:CREATE')
  @Audit(AuditAction.CREATE)
  @ApiOperation({ summary: 'Créer un utilisateur' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put(':id')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.UPDATE)
  @ApiOperation({ summary: 'Modifier un utilisateur' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('USER:DELETE')
  @Audit(AuditAction.DELETE)
  @ApiOperation({ summary: 'Supprimer un utilisateur (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }

  @Post(':id/restore')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.RESTORE)
  @ApiOperation({ summary: 'Restaurer un utilisateur supprimé' })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.restoreUser(id);
  }

  @Delete(':id/hard')
  @Permissions('USER:DELETE')
  @Audit(AuditAction.DELETE)
  @ApiOperation({
    summary: 'Suppression physique définitive (ROOT uniquement)',
  })
  hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.hardDeleteUser(id);
  }

  @Post(':id/setup-password')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.PASSWORD_RESET)
  @ApiOperation({ summary: 'Mettre en place / réinitialiser le mot de passe' })
  setupPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetupPasswordDto,
  ) {
    return this.usersService.setupPassword(id, dto);
  }

  @Post(':id/resend-invitation')
  @Permissions('USER:UPDATE')
  @AuditSkip()
  @ApiOperation({
    summary: "Renvoyer l'email d'invitation à un utilisateur non activé",
  })
  @ApiResponse({ status: 200, description: 'Invitation renvoyée' })
  @ApiResponse({ status: 409, description: 'Compte déjà activé' })
  resendInvitation(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.resendInvitation(id);
  }

  @Post(':id/lock')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.UPDATE)
  @ApiOperation({ summary: 'Bloquer un compte utilisateur' })
  lock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AccessLockDto) {
    return this.usersService.lockUser(id, dto);
  }

  @Post(':id/unlock')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.UPDATE)
  @ApiOperation({ summary: 'Débloquer un compte utilisateur' })
  unlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.unlockUser(id);
  }

  @Get(':id/access-lock-history')
  @Permissions('USER:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: 'Historique des blocages/déblocages' })
  getAccessLockHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filter: AccessLockHistoryFilterDto,
  ) {
    return this.usersService.getAccessLockHistory(id, filter);
  }

  @Post(':id/roles')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.UPDATE)
  @ApiOperation({ summary: 'Assigner des rôles à un utilisateur' })
  assignRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
  ) {
    return this.usersService.assignRoles(id, dto);
  }

  @Delete(':id/roles')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.UPDATE)
  @ApiOperation({ summary: 'Retirer des rôles à un utilisateur' })
  removeRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveRolesDto,
  ) {
    return this.usersService.removeRoles(id, dto);
  }

  @Get(':id/roles')
  @Permissions('USER:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Rôles d'un utilisateur" })
  getUserRoles(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserRoles(id);
  }

  @Post(':id/avatar')
  @Permissions('USER:UPDATE')
  @Audit(AuditAction.UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: "Téléverser l'avatar d'un utilisateur (démo Supabase Storage)",
  })
  @ApiResponse({ status: 200, description: 'Avatar téléversé (URL signée)' })
  @ApiResponse({ status: 413, description: 'Fichier trop volumineux' })
  uploadAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(id, file);
  }

  @Get(':id/avatar')
  @Permissions('USER:READ')
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "URL signée de l'avatar d'un utilisateur" })
  @ApiResponse({ status: 200, description: 'URL signée de l’avatar' })
  @ApiResponse({ status: 404, description: 'Aucun avatar' })
  getAvatar(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getAvatar(id);
  }
}
