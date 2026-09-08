import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exception métier portant un code technique stable et un message.
 * Le payload contient `code` et `message` pour que le filtre global
 * puisse les extraire et construire une réponse standardisée.
 */
export class BusinessException extends HttpException {
  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.CONFLICT,
  ) {
    super({ code, message }, status);
  }
}
