import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TokenBlacklistService } from '../token-blacklist.service';

export enum JwtTokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
}

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  typ: JwtTokenType;
  tenantId?: string;
  tenantCode?: string;
  isRoot?: boolean;
}

/**
 * Utilisateur authentifié attaché à `request.user` par JwtStrategy.validate().
 * Utilisé par les guards et les services tenant pour connaître le niveau d'accès.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  tenantId?: string;
  tenantCode?: string;
  isRoot?: boolean;
}

/**
 * Stratégie Passport JWT pour l'authentification par Bearer token.
 *
 * Inspirée du pattern efarmOS :
 * - Rejette les tokens avec typ === 'refresh' (les refresh tokens ne servent qu'à /auth/refresh)
 * - Vérifie la blacklist pour détecter les tokens invalidés (logout, rotation)
 * - Retourne l'identité utilisateur complète (id, email, roles, permissions, tenant)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly tokenBlacklistService: TokenBlacklistService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'access-fallback',
    });
  }

  validate(payload: JwtPayload) {
    // Les refresh tokens ne doivent pas être utilisés pour l'authentification Bearer
    if (payload.typ === JwtTokenType.REFRESH) {
      throw new UnauthorizedException(
        "Ce jeton est un jeton de rafraîchissement. Utilisez un jeton d'accès.",
      );
    }

    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
      tenantId: payload.tenantId,
      tenantCode: payload.tenantCode,
      isRoot: payload.isRoot ?? false,
    };
  }
}
