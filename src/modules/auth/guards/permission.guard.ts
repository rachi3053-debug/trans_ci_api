import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { ROLES_KEY } from './roles.decorator';

interface AuthUser {
  roles?: string[];
  permissions?: string[];
}

interface RequestWithUser {
  user?: AuthUser;
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (!requiredRoles || requiredRoles.length === 0) &&
      (!requiredPermissions || requiredPermissions.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Non autorisé');
    }

    if (requiredRoles && requiredRoles.length > 0) {
      const userRoles = user.roles ?? [];
      const hasRole = requiredRoles.some((role) => userRoles.includes(role));
      if (!hasRole) {
        throw new ForbiddenException('Rôle insuffisant');
      }
    }

    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = user.permissions ?? [];
      const hasPermission = requiredPermissions.every((perm) =>
        userPermissions.includes(perm),
      );
      if (!hasPermission) {
        throw new ForbiddenException('Permission insuffisante');
      }
    }

    return true;
  }
}
