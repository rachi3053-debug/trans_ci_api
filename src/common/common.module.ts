import { Global, Module } from '@nestjs/common';
import { MessageService } from './messages/message.service';
import { PaginationService } from './services/pagination.service';
import { SearchService } from './services/search.service';
import { SoftDeleteService } from './services/soft-delete.service';
import { BulkOperationsService } from './services/bulk-operations.service';
import { PasswordService } from './services/password.service';
import { SupabaseStorageService } from './services/supabase-storage.service';

/**
 * Module global exposant les services transverses à toute l'application.
 * - MessageService : construction des réponses standardisées
 * - PaginationService : pagination TypeORM avec meta + links
 * - SearchService : recherche plein texte paginée générique
 * - SoftDeleteService : soft delete / restore / hard delete génériques
 * - BulkOperationsService : opérations en masse génériques
 * - SupabaseStorageService : accès centralisé à Supabase Storage (upload/download/delete/signed URLs)
 */
@Global()
@Module({
  providers: [
    MessageService,
    PaginationService,
    SearchService,
    SoftDeleteService,
    BulkOperationsService,
    PasswordService,
    SupabaseStorageService,
  ],
  exports: [
    MessageService,
    PaginationService,
    SearchService,
    SoftDeleteService,
    BulkOperationsService,
    PasswordService,
    SupabaseStorageService,
  ],
})
export class CommonModule {}
