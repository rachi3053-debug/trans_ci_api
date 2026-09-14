import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { MessageService } from '../messages/message.service';
import { MessageCode } from '../messages/message.codes';

/**
 * Types MIME autorisés par catégorie de fichier.
 * Source de vérité des contrôles de type (le nom du fichier n'est jamais fiable).
 */
export const IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const DOCUMENT_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

/**
 * Options de validation d'un téléversement.
 */
export interface FileValidationOptions {
  /** Types MIME autorisés (ex: IMAGE_MIME_TYPES). */
  allowedMimes?: readonly string[];
  /** Taille maximale en octets (défaut: MAX_FILE_SIZE, 10 Mo). */
  maxSize?: number;
}

/**
 * Métadonnées retournées après un téléversement.
 */
export interface StorageUploadResult {
  bucket: string;
  /** Chemin complet dans le bucket (dossier + nom de stockage). */
  path: string;
  /** Nom de stockage généré (sécurisé, jamais le nom d'origine). */
  name: string;
  mimeType: string;
  size: number;
  /** URL publique : uniquement si le bucket est public (photos). */
  publicUrl?: string;
  /** URL signée temporaire : à privilégier pour les buckets privés. */
  signedUrl?: string;
}

/**
 * Service centralisé d'accès à Supabase Storage.
 *
 * Architecture : Controller -> Service métier -> SupabaseStorageService -> Supabase.
 * Aucun controller ne doit appeler `supabase.storage` directement.
 *
 * La clé `SUPABASE_SERVICE_ROLE_KEY` est injectée UNIQUEMENT dans le client,
 * jamais loggée, jamais exposée dans une réponse API, jamais envoyée au front.
 */
@Injectable()
export class SupabaseStorageService {
  /** Bucket des photos générales de l'application. */
  readonly photoBucket: string;
  /** Bucket des avatars / photos de profil. */
  readonly avatarsBucket: string;
  /** Bucket des documents (permis, contrats, justificatifs...). */
  readonly documentsBucket: string;

  private readonly defaultMaxSize: number;
  private readonly client: ReturnType<typeof createClient>;

  constructor(
    private readonly configService: ConfigService,
    private readonly messageService: MessageService,
  ) {
    const url = this.configService.getOrThrow<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    this.photoBucket = this.configService.getOrThrow<string>(
      'SUPABASE_STORAGE_BUCKET',
    );
    this.avatarsBucket = this.configService.getOrThrow<string>(
      'SUPABASE_BUCKET_AVATARS',
    );
    this.documentsBucket = this.configService.getOrThrow<string>(
      'SUPABASE_BUCKET_DOCUMENTS',
    );

    this.defaultMaxSize =
      Number(this.configService.get<string>('MAX_FILE_SIZE')) || 10_485_760;

    // Le client est le seul détenteur de la clé de service role.
    this.client = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  /**
   * Téléverse un fichier dans un bucket à un chemin donné.
   * Le nom de stockage est toujours généré de façon sécurisée (UUID) :
   * le nom d'origine fourni par l'utilisateur n'est jamais utilisé tel quel.
   *
   * @param bucket   Nom du bucket (via ConfigService, jamais en dur).
   * @param path     Dossier de destination à l'intérieur du bucket (ex: chauffeurs/123/permis).
   * @param name     Libellé du fichier (sanitisé, préfixé par un UUID).
   * @param file     Fichier reçu (Multer).
   */
  async upload(
    bucket: string,
    path: string,
    name: string,
    file: Express.Multer.File,
    options: FileValidationOptions = {},
  ): Promise<StorageUploadResult> {
    const allowedMimes = options.allowedMimes;
    const maxSize = options.maxSize ?? this.defaultMaxSize;

    this.assertFileType(file.mimetype, allowedMimes);
    this.assertFileSize(file.size, maxSize);

    const storageName = this.buildSecureName(name, file.mimetype);
    const fullPath = this.joinPath(path, storageName);

    const { error } = await this.client.storage
      .from(bucket)
      .upload(fullPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
        cacheControl: '3600',
      });

    if (error) {
      this.messageService.throwBusiness(
        MessageCode.FILE_UPLOAD_ERROR,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      bucket,
      path: fullPath,
      name: storageName,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /** Téléverse une photo générale : bucket `photos`, chemin `{folder}/{id}/...`. */
  uploadPhoto(
    folder: string,
    id: string | number,
    file: Express.Multer.File,
    options: FileValidationOptions = {},
  ): Promise<StorageUploadResult> {
    return this.upload(
      this.photoBucket,
      this.joinPath(folder, String(id)),
      'photo',
      file,
      { allowedMimes: IMAGE_MIME_TYPES, ...options },
    );
  }

  /** Téléverse un avatar : bucket `avatars`, chemin `users/{userId}/...`. */
  uploadAvatar(
    userId: string,
    file: Express.Multer.File,
    options: FileValidationOptions = {},
  ): Promise<StorageUploadResult> {
    return this.upload(
      this.avatarsBucket,
      this.joinPath('users', String(userId)),
      'avatar',
      file,
      { allowedMimes: IMAGE_MIME_TYPES, ...options },
    );
  }

  /**
   * Téléverse un document : bucket `documents`, chemin `{entityType}/{entityId}/{dossier}/...`.
   * Ex: uploadDocument('chauffeurs', 123, file, 'permis')
   *     -> documents/chauffeurs/123/permis/{uuid}-document.pdf
   */
  uploadDocument(
    entityType: string,
    entityId: string | number,
    file: Express.Multer.File,
    dossier = 'autres',
    options: FileValidationOptions = {},
  ): Promise<StorageUploadResult> {
    return this.upload(
      this.documentsBucket,
      this.joinPath(entityType, String(entityId), dossier),
      'document',
      file,
      { allowedMimes: DOCUMENT_MIME_TYPES, ...options },
    );
  }

  /** Télécharge un fichier et retourne son contenu binaire. */
  async download(bucket: string, path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .download(path);
    if (error || !data) {
      this.messageService.throwBusiness(
        MessageCode.FILE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return Buffer.from(await data.arrayBuffer());
  }

  /** Supprime un fichier. */
  async delete(bucket: string, path: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([path]);
    if (error) {
      this.messageService.throwBusiness(
        MessageCode.FILE_DELETE_ERROR,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * URL publique permanente. Réservée aux fichiers réellement publics
   * (bucket `photos`) : pour les buckets privés, privilégier createSignedUrl().
   */
  getPublicUrl(bucket: string, path: string): string {
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  /**
   * URL signée temporaire : accès contrôlé à un fichier d'un bucket privé.
   * @param expiresIn Durée de validité en secondes (défaut: 1 heure).
   */
  async createSignedUrl(
    bucket: string,
    path: string,
    expiresIn = 3600,
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      this.messageService.throwBusiness(
        MessageCode.FILE_DOWNLOAD_ERROR,
        HttpStatus.BAD_GATEWAY,
      );
    }
    return data.signedUrl;
  }

  // ---------------------------------------------------------------------------
  // Validation des fichiers (contrôle systématique côté backend).
  // ---------------------------------------------------------------------------

  private assertFileType(
    mimetype: string,
    allowedMimes?: readonly string[],
  ): void {
    if (allowedMimes && !allowedMimes.includes(mimetype)) {
      this.messageService.throwBusiness(
        MessageCode.FILE_TYPE_NOT_ALLOWED,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertFileSize(size: number, maxSize: number): void {
    if (size > maxSize) {
      this.messageService.throwBusiness(
        MessageCode.FILE_TOO_LARGE,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }

  /**
   * Génère un nom de stockage unique et sûr :
   * `{uuid}-{libellé sanitisé}{extension déduite du MIME}`.
   * Le nom d'origine utilisateur n'est jamais utilisé tel quel
   * (anti path traversal, anti collision, anti extension trompeuse).
   */
  private buildSecureName(label: string, mimetype: string): string {
    let base = label
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    // Retire une extension éventuellement déjà présente dans le label
    // pour éviter un double suffixe (.jpg.jpg) et toute ambiguïté de type.
    base = base.replace(/\.(jpe?g|png|webp|pdf)$/, '');
    return `${randomUUID()}-${base}${this.extensionFromMime(mimetype)}`;
  }

  private extensionFromMime(mimetype: string): string {
    const extensionByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };
    return extensionByMime[mimetype] ?? '.bin';
  }

  private joinPath(...segments: string[]): string {
    return segments
      .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/');
  }
}
