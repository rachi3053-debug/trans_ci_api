import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ApiErrorResponse } from '../responses/api-response.interface';
import { MessageCode } from '../messages/message.codes';
import { MESSAGES } from '../messages/message.constants';

interface BusinessPayload {
  code?: string;
  message?: string;
}

interface ValidationErrorItem {
  property?: string;
  constraints?: Record<string, string>;
}

interface ValidationPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

/**
 * Filtre global qui transforme TOUTES les exceptions en réponse
 * standardisée ApiErrorResponse. Ne JAMAIS exposer de détails techniques
 * en production (stack trace, SQL, secrets).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProduction = process.env.NODE_ENV === 'production';
    const timestamp = new Date().toISOString();
    const path = request.url;

    // 1. Erreurs TypeORM / PostgreSQL : ne jamais exposer les détails.
    if (exception instanceof QueryFailedError) {
      this.logger.error(
        `Erreur base de données: ${exception.message}`,
        exception.stack,
      );
      const body = this.buildErrorBody(
        this.mapDbError(exception),
        MESSAGES.INTERNAL_SERVER_ERROR,
        timestamp,
        path,
        isProduction,
        exception,
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
      return;
    }

    // 2. Exceptions HTTP (BusinessException, NotFoundException, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // 2a. Payload avec code + message (BusinessException ou custom)
      if (
        payload &&
        typeof payload === 'object' &&
        'code' in payload &&
        'message' in payload
      ) {
        const { code, message } = payload as BusinessPayload;
        const body = this.buildErrorBody(
          code ?? this.mapStatusToCode(status),
          message ?? MESSAGES.INTERNAL_SERVER_ERROR,
          timestamp,
          path,
          isProduction,
          exception,
        );
        response.status(status).json(body);
        return;
      }

      // 2b. Erreurs de validation class-validator (ValidationPipe)
      if (this.isValidationError(payload)) {
        const errors = this.extractValidationErrors(payload);
        const body: ApiErrorResponse = {
          success: false,
          code: MessageCode.VALIDATION_ERROR,
          message: MESSAGES.VALIDATION_ERROR,
          data: null,
          errors,
          timestamp,
          path,
        };
        response.status(HttpStatus.BAD_REQUEST).json(body);
        return;
      }

      // 2c. Autres HttpException : mapper le status vers un code générique.
      const code = this.mapStatusToCode(status);
      const message = this.extractHttpMessage(payload);
      const body = this.buildErrorBody(
        code,
        message,
        timestamp,
        path,
        isProduction,
        exception,
      );
      response.status(status).json(body);
      return;
    }

    // 3. Erreurs inconnues : logguer et renvoyer 500 générique.
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    const body = this.buildErrorBody(
      MessageCode.INTERNAL_SERVER_ERROR,
      MESSAGES.INTERNAL_SERVER_ERROR,
      timestamp,
      path,
      isProduction,
      exception,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  private buildErrorBody(
    code: string,
    message: string,
    timestamp: string,
    path: string,
    isProduction: boolean,
    exception: unknown,
  ): ApiErrorResponse & { debug?: string } {
    const body: ApiErrorResponse & { debug?: string } = {
      success: false,
      code,
      message,
      data: null,
      timestamp,
      path,
    };

    // En dev uniquement, on peut ajouter le message technique.
    if (!isProduction) {
      body.debug =
        exception instanceof Error ? exception.message : String(exception);
    }

    return body;
  }

  private mapStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.NOT_FOUND:
        return MessageCode.RESOURCE_NOT_FOUND;
      case HttpStatus.UNAUTHORIZED:
        return MessageCode.AUTH_UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return MessageCode.ACCESS_DENIED;
      case HttpStatus.BAD_REQUEST:
        return MessageCode.VALIDATION_ERROR;
      case HttpStatus.CONFLICT:
        return MessageCode.CONFLICT;
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return MessageCode.INTERNAL_SERVER_ERROR;
      default:
        return MessageCode.INTERNAL_SERVER_ERROR;
    }
  }

  private extractHttpMessage(payload: unknown): string {
    if (typeof payload === 'string') return payload;
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const message = (payload as { message: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.length > 0) {
        return String(message[0]);
      }
    }
    return MESSAGES.INTERNAL_SERVER_ERROR;
  }

  private isValidationError(payload: unknown): payload is ValidationPayload {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as ValidationPayload;
    return (
      Array.isArray(p.message) &&
      p.message.length > 0 &&
      typeof p.message[0] === 'object' &&
      p.message[0] !== null &&
      'property' in (p.message[0] as object)
    );
  }

  private extractValidationErrors(
    payload: ValidationPayload,
  ): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    if (!Array.isArray(payload.message)) return errors;

    for (const item of payload.message as unknown as ValidationErrorItem[]) {
      if (!item.property || !item.constraints) continue;
      errors[item.property] = Object.values(item.constraints);
    }

    return errors;
  }

  private mapDbError(error: QueryFailedError): string {
    // Contrainte unique PostgreSQL (23505) -> conflit métier générique.
    const driverError = error.driverError as { code?: string } | undefined;
    if (driverError?.code === '23505') {
      return MessageCode.CONFLICT;
    }
    return MessageCode.INTERNAL_SERVER_ERROR;
  }
}
