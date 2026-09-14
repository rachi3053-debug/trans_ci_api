import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import {
  SupabaseStorageService,
  IMAGE_MIME_TYPES,
} from './supabase-storage.service';
import { MessageService } from '../messages/message.service';
import { MessageCode } from '../messages/message.codes';

const MOCK_URL = 'https://mock.supabase.co';
const MOCK_SERVICE_ROLE_KEY = 'service_role_key_secrete_a_ne_jamais_divulguer';

const mockUpload = jest.fn();
const mockDownload = jest.fn();
const mockRemove = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockCreateSignedUrl = jest.fn();

const storageFrom = jest.fn().mockReturnValue({
  upload: mockUpload,
  download: mockDownload,
  remove: mockRemove,
  getPublicUrl: mockGetPublicUrl,
  createSignedUrl: mockCreateSignedUrl,
});

const client = {
  storage: { from: storageFrom },
  auth: { getSession: jest.fn() },
};

beforeEach(() => {
  jest.clearAllMocks();
  (createClient as jest.Mock).mockReturnValue(client);
  mockUpload.mockResolvedValue({ data: { path: 'path' }, error: null });
  mockDownload.mockResolvedValue({
    data: new Blob(['contenu']),
    error: null,
  });
  mockRemove.mockResolvedValue({ data: null, error: null });
  mockGetPublicUrl.mockReturnValue({
    data: { publicUrl: 'https://mock.supabase.co/photo' },
  });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://mock.supabase.co/signed' },
    error: null,
  });
});

const env = (
  overrides: Record<string, string> = {},
): Record<string, string> => ({
  SUPABASE_URL: MOCK_URL,
  SUPABASE_SERVICE_ROLE_KEY: MOCK_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET: 'photos',
  SUPABASE_BUCKET_AVATARS: 'avatars',
  SUPABASE_BUCKET_DOCUMENTS: 'documents',
  MAX_FILE_SIZE: '10485760',
  ...overrides,
});

async function createService(
  overrides: Record<string, string> = {},
): Promise<SupabaseStorageService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SupabaseStorageService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => env(overrides)[key]),
          getOrThrow: jest.fn((key: string) => {
            const value = env(overrides)[key];
            if (value === undefined || value === '') {
              throw new Error(`Variable d'environnement manquante: ${key}`);
            }
            return value;
          }),
        },
      },
      MessageService,
    ],
  }).compile();

  return module.get(SupabaseStorageService);
}

function makeFile(
  mimetype: string,
  size = 1024,
  originalname = 'permis.pdf',
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size,
    buffer: Buffer.from('contenu du fichier'),
    stream: undefined as unknown as NodeJS.ReadableStream,
  } as Express.Multer.File;
}

describe('SupabaseStorageService', () => {
  describe('initialisation', () => {
    it('représente les trois buckets depuis la configuration', async () => {
      const service = await createService();
      expect(service.photoBucket).toBe('photos');
      expect(service.avatarsBucket).toBe('avatars');
      expect(service.documentsBucket).toBe('documents');
    });

    it('représente les buckets via ConfigService et pas en dur dans le code', async () => {
      const service = await createService({
        SUPABASE_BUCKET_AVATARS: 'profils',
      });
      expect(service.avatarsBucket).toBe('profils');
    });

    it('initialise le client Supabase avec URL et clé de service role', async () => {
      await createService();
      expect(createClient).toHaveBeenCalledWith(
        MOCK_URL,
        MOCK_SERVICE_ROLE_KEY,
        expect.anything(),
      );
    });

    it('échoue si la clé de service role manque', async () => {
      await expect(
        createService({ SUPABASE_SERVICE_ROLE_KEY: '' }),
      ).rejects.toThrow();
    });
  });

  describe('upload', () => {
    it('upload une image dans le chemin attendu et génère un nom sécurisé', async () => {
      const service = await createService();
      const file = makeFile('image/jpeg');
      const result = await service.upload(
        service.photoBucket,
        'gares/101',
        'etiquette-insecure.jpg',
        file,
        { allowedMimes: IMAGE_MIME_TYPES },
      );

      expect(storageFrom).toHaveBeenCalledWith('photos');
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(
          /^gares\/101\/[0-9a-f-]{36}-etiquette-insecure\.jpg$/,
        ),
        expect.any(Buffer),
        expect.objectContaining({ contentType: 'image/jpeg' }),
      );
      expect(result.path).not.toContain(file.originalname);
    });

    it('upload un avatar dans avatars/users/{userId}', async () => {
      const service = await createService();
      await service.uploadAvatar('u-42', makeFile('image/png'));

      expect(storageFrom).toHaveBeenCalledWith('avatars');
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^users\/u-42\/[0-9a-f-]{36}-avatar\.png$/),
        expect.any(Buffer),
        expect.anything(),
      );
    });

    it('upload un document dans documents/chauffeurs/{id}/permis', async () => {
      const service = await createService();
      await service.uploadDocument(
        'chauffeurs',
        '123',
        makeFile('application/pdf'),
        'permis',
      );

      expect(storageFrom).toHaveBeenCalledWith('documents');
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(
          /^chauffeurs\/123\/permis\/[0-9a-f-]{36}-document\.pdf$/,
        ),
        expect.any(Buffer),
        expect.anything(),
      );
    });

    it('refuse un type MIME interdit', async () => {
      const service = await createService();
      await expect(
        service.uploadDocument('chauffeurs', '123', makeFile('text/html')),
      ).rejects.toMatchObject({
        response: { code: MessageCode.FILE_TYPE_NOT_ALLOWED },
        status: HttpStatus.BAD_REQUEST,
      });
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('refuse un fichier trop volumineux', async () => {
      const service = await createService();
      const file = makeFile('image/jpeg', 10_485_761);
      await expect(service.uploadAvatar('u-1', file)).rejects.toMatchObject({
        response: { code: MessageCode.FILE_TOO_LARGE },
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('supporte une taille personnalisée via options', async () => {
      const service = await createService();
      const file = makeFile('image/jpeg', 2048);
      await expect(
        service.uploadAvatar('u-1', file, { maxSize: 1024 }),
      ).rejects.toMatchObject({
        response: { code: MessageCode.FILE_TOO_LARGE },
      });
    });
  });

  describe('signed URL / public URL / download / delete', () => {
    it('génère une URL signée pour un bucket privé', async () => {
      const service = await createService();
      const url = await service.createSignedUrl(
        service.documentsBucket,
        'chauffeurs/123/permis/permis.pdf',
      );
      expect(url).toBe('https://mock.supabase.co/signed');
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        'chauffeurs/123/permis/permis.pdf',
        3600,
      );
    });

    it('génère une URL publique pour un bucket public', async () => {
      const service = await createService();
      const url = service.getPublicUrl(
        service.photoBucket,
        'gares/101/photo.jpg',
      );
      expect(url).toBe('https://mock.supabase.co/photo');
    });

    it('télécharge un fichier', async () => {
      const service = await createService();
      const buffer = await service.download(
        service.documentsBucket,
        'permis.pdf',
      );
      expect(buffer.toString()).toBe('contenu');
    });

    it('supprime un fichier', async () => {
      const service = await createService();
      await service.delete(service.documentsBucket, 'permis.pdf');
      expect(mockRemove).toHaveBeenCalledWith(['permis.pdf']);
    });

    it('lève une erreur claire si le téléchargement échoue', async () => {
      mockDownload.mockResolvedValue({ data: null, error: { message: 'x' } });
      const service = await createService();
      await expect(
        service.download(service.documentsBucket, 'p.pdf'),
      ).rejects.toMatchObject({
        response: { code: MessageCode.FILE_NOT_FOUND },
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  describe('non-fuite de la clé de service role', () => {
    it("n'expose aucune propriété énumérable contenant la clé", async () => {
      const service = await createService();
      const exposedValues: unknown[] = [];
      for (const key of Object.keys(service)) {
        exposedValues.push(
          (service as unknown as Record<string, unknown>)[key],
        );
      }
      // Aucune valeur de propriété publique ne doit contenir la clé secrète.
      expect(JSON.stringify(exposedValues)).not.toContain(
        MOCK_SERVICE_ROLE_KEY,
      );
    });
  });
});
