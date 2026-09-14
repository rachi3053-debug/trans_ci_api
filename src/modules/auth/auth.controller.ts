import {
  Body,
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from './guards/public.decorator';
import { CurrentUser } from './guards/current-user.decorator';
import { Audit, AuditSkip } from '../../common/decorators/audit.decorator';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { ActivationService } from './activation.service';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ValidateTokenQueryDto } from './dto/validate-token-query.dto';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly activationService: ActivationService,
    private readonly messageService: MessageService,
  ) {}

  @Public()
  @Post('register')
  @Audit(AuditAction.CREATE)
  @ApiOperation({ summary: "Inscription d'un nouvel utilisateur" })
  @ApiResponse({ status: 201, description: 'Utilisateur créé' })
  @ApiResponse({ status: 409, description: 'Email déjà utilisé' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Audit(AuditAction.LOGIN)
  @ApiOperation({ summary: 'Connexion' })
  @ApiResponse({ status: 200, description: 'Connexion réussie' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Rafraîchir le token d'accès" })
  @ApiResponse({ status: 200, description: 'Nouveau token' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Audit(AuditAction.LOGOUT)
  @ApiOperation({ summary: 'Déconnexion (invalide le token)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Le token à invalider' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Déconnexion réussie' })
  logout(@CurrentUser() user: { id: string }, @Body('token') token?: string) {
    return this.authService.logout(token ?? '');
  }

  @Get('me')
  @ApiBearerAuth()
  @Audit(AuditAction.READ)
  @ApiOperation({ summary: "Profil de l'utilisateur connecté" })
  getMe(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id);
  }

  // ---------------------------------------------------------------------------
  // Activation de compte (flux invitation)
  // ---------------------------------------------------------------------------
  // NB : @AuditSkip() sur ces deux routes car l'intercepteur d'audit
  // journaliserait l'URL complète (qui contient le token brut dans la query
  // string). L'audit est fait manuellement dans ActivationService, avec des
  // métadonnées nettoyées (aucun token, aucun mot de passe).

  @Public()
  @Get('activation/validate')
  @AuditSkip()
  @ApiOperation({
    summary: "Valider un jeton d'invitation (avant affichage du formulaire)",
  })
  async validateActivationToken(@Query() query: ValidateTokenQueryDto) {
    const result = await this.activationService.validateToken(query.token);
    return this.messageService.success(
      result.valid
        ? MessageCode.INVITATION_VALIDATED
        : MessageCode.INVITATION_INVALID_OR_EXPIRED,
      result,
    );
  }

  @Public()
  @Post('activation/activate')
  @HttpCode(HttpStatus.OK)
  @AuditSkip()
  @ApiOperation({
    summary: 'Activer un compte invité et définir son mot de passe',
  })
  @ApiResponse({ status: 200, description: 'Compte activé' })
  @ApiResponse({
    status: 400,
    description: 'Jeton invalide/expiré ou mots de passe différents',
  })
  async activateAccount(@Body() dto: ActivateAccountDto) {
    if (dto.password !== dto.confirmPassword) {
      this.messageService.throwBusiness(
        MessageCode.PASSWORD_MISMATCH,
        HttpStatus.BAD_REQUEST,
      );
    }
    const user = await this.activationService.activate(dto.token, dto.password);
    return this.messageService.success(MessageCode.USER_ACCOUNT_ACTIVATED, {
      id: user.id,
      email: user.email,
    });
  }

  // ---------------------------------------------------------------------------
  // Mot de passe oublié (réinitialisation par email)
  // ---------------------------------------------------------------------------
  // returns neutre pour ne pas révéler l'existence d'un compte.

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Demander un lien de réinitialisation de mot de passe',
  })
  @ApiResponse({ status: 200, description: 'Demande traitée (réponse neutre)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @AuditSkip()
  @ApiOperation({
    summary: 'Réinitialiser le mot de passe avec le jeton reçu par email',
  })
  @ApiResponse({ status: 200, description: 'Mot de passe réinitialisé' })
  @ApiResponse({
    status: 400,
    description: 'Jeton invalide/expiré ou mots de passe différents',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(
      dto.token,
      dto.password,
      dto.confirmPassword,
    );
  }
}
