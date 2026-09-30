import { HttpStatus, Injectable } from '@nestjs/common';
import { MessageCode } from './message.codes';
import { MESSAGES } from './message.constants';
import {
  ApiErrorResponse,
  ApiResponse,
} from '../responses/api-response.interface';
import { ApiResponse as ApiResponseHelper } from '../responses/api-response.helper';
import { BusinessException } from '../exceptions/business.exception';

/**
 * Service centralisé de construction des réponses et des exceptions.
 * Utilise MESSAGES comme source de vérité des textes FR.
 */
@Injectable()
export class MessageService {
  getMessage(code: MessageCode): string {
    return MESSAGES[code];
  }

  success<T>(code: MessageCode, data: T): ApiResponse<T> {
    return ApiResponseHelper.success(code, this.getMessage(code), data);
  }

  error(code: MessageCode): ApiErrorResponse {
    return ApiResponseHelper.error(code, this.getMessage(code));
  }

  warning<T>(code: MessageCode, data: T | null): ApiResponse<T> {
    return ApiResponseHelper.warning(code, this.getMessage(code), data);
  }

  info<T>(code: MessageCode, data: T | null): ApiResponse<T> {
    return ApiResponseHelper.info(code, this.getMessage(code), data);
  }

  throwBusiness(code: MessageCode, status?: HttpStatus): never {
    throw new BusinessException(code, this.getMessage(code), status);
  }
}
