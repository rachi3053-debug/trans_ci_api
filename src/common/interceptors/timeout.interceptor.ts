import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/**
 * Intercepteur de timeout global.
 * Annule les requêtes qui dépassent le délai imparti (défaut: 30 secondes).
 * Inspiré du pattern efarmOS (TimeoutInterceptor).
 *
 * Si le timeout est atteint, lève une RequestTimeoutException (408).
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly timeoutMs = 30000;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException(
                'La requête a pris trop de temps. Veuillez réessayer.',
              ),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
