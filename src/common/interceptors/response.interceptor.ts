import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../responses/api-response.interface';

/**
 * Intercepteur de réponse standardisé.
 * Wrap automatiquement les réponses success dans le format ApiResponse<T>.
 *
 * Si le handler retourne déjà un objet ApiResponse (avec la propriété 'success'),
 * l'intercepteur le laisse passer tel quel pour éviter un double-wrapping.
 *
 * Inspiré du pattern efarmOS (ResponseInterceptor).
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        // Si le data est déjà au format ApiResponse (avec 'success'), le laisser tel quel
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Sinon, wrapper dans un ApiResponse success
        const response: ApiResponse<unknown> = {
          success: true,
          code: 'OK',
          message: 'Opération effectuée avec succès.',
          data,
        };
        return response;
      }),
    );
  }
}
