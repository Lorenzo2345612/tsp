import { HttpException, HttpStatus } from '@nestjs/common';

export class CheckPointNotFound extends HttpException {
  constructor() {
    super('El checkpoint no existe', HttpStatus.BAD_REQUEST);
  }
}
