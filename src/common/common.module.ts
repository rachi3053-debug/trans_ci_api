import { Global, Module } from '@nestjs/common';
import { MessageService } from './messages/message.service';

/**
 * Module global exposant MessageService à toute l'application.
 */
@Global()
@Module({
  providers: [MessageService],
  exports: [MessageService],
})
export class CommonModule {}
