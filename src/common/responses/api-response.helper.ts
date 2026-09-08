import {
  ApiErrorResponse,
  ApiResponse as ApiResponseInterface,
} from './api-response.interface';

/**
 * Helper statique pour construire des réponses API standardisées.
 */
export class ApiResponse {
  static success<T>(
    code: string,
    message: string,
    data: T,
  ): ApiResponseInterface<T> {
    return { success: true, code, message, data };
  }

  static error(code: string, message: string): ApiErrorResponse {
    return {
      success: false,
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      path: '',
    };
  }

  static warning<T>(
    code: string,
    message: string,
    data: T | null,
  ): ApiResponseInterface<T> {
    return { success: true, code, message, data };
  }

  static info<T>(
    code: string,
    message: string,
    data: T | null,
  ): ApiResponseInterface<T> {
    return { success: true, code, message, data };
  }
}
