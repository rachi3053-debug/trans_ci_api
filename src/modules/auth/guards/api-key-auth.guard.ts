import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ApiKeysService } from '../../api-keys/api-keys.service';

interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
  user?: Record<string, unknown>;
}

@Injectable()
export class ApiKeyAuthGuard {
  constructor(
    private reflector: Reflector,
    private apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) return false;

    const user = await this.apiKeysService.validateApiKey(apiKey);
    if (!user) {
      throw new UnauthorizedException('API key invalide ou expirée');
    }

    request.user = user;
    return true;
  }
}
