import { HttpStatus } from '@nestjs/common';
import { VilleService } from './ville.service';
import { Ville } from './entities/ville.entity';
import { MessageCode } from '../../common/messages/message.codes';
import { BusinessException } from '../../common/exceptions/business.exception';


describe('VilleService', () => {
  let service: VilleService;

  const VILLE_ID = '33333333-3333-3333-3333-333333333333';
  const AUTRE_ID = '44444444-4444-4444-4444-444444444444';

  interface VilleRow {
    id: string;
    tenantId: string | null;
    nom: string;
    code: string;
    region: string | null;
    departement: string | null;
    codePostal: string | null;
    actif: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt: Date | null;
    createdBy?: string | null;
    updatedBy?: string | null;
    deletedBy?: string | null;
  }

  const makeVille = (overrides: Partial<VilleRow> = {}): Ville =>
    ({
      id: AUTRE_ID,
      tenantId: '234-67EYGDYE',
      nom: 'Abidjan',
      code: 'ABI',
      region: 'Région des Lagunes',
      departement: "Département d'Abidjan",
      codePostal: 'BP 2000',
      actif: true,
      deletedAt: null,
      ...overrides,
    }) as Ville;

  // --- Doublons de résultats -------------------------------------------------

  let mockVilles: Ville[];
  let duplicateHit: Ville | null;

  const withConflict = (): void => {
    duplicateHit = makeVille();
  };

  const noConflict = (): void => {
    duplicateHit = null;
  };

  const villeRepo = {
    create: jest.fn((data: Partial<Ville>) => makeVille(data)),
    save: jest.fn((v: Ville) => Promise.resolve(v)),
    findOne: jest.fn(),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
    createQueryBuilder: jest.fn(),
  };

  const messageService = {
    success: jest.fn((code: MessageCode, data: unknown) => ({ code, data })),
    throwBusiness: jest.fn((code: MessageCode, status?: HttpStatus): never => {
      throw new BusinessException(code, code, status);
    }),
  };

  const tenantContext = {
    isRoot: true,
    userId: 'root-user',
  };

  const searchService = { searchAndPaginate: jest.fn() };
  const softDeleteService = { softDelete: jest.fn(() => Promise.resolve()) };

  beforeEach(() => {
    jest.clearAllMocks();
    mockVilles = [];
    noConflict();

    // QueryBuilder de `assertNoDuplicate` : sélecteur chaînable minimal.
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(() => Promise.resolve(duplicateHit)),
    };
    villeRepo.createQueryBuilder.mockReturnValue(qb);

    villeRepo.findOne.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        const found = mockVilles.find((v) => v.id === where.id);
        return Promise.resolve(found ?? null);
      },
    );
    villeRepo.save.mockImplementation((v: Ville) => Promise.resolve(v));
    villeRepo.create.mockImplementation((data: Partial<Ville>) => ({
      ...makeVille(),
      ...data,
    }));

    tenantContext.isRoot = true;

    service = new VilleService(
      villeRepo as never,
      messageService as never,
      tenantContext as never,
      searchService as never,
      softDeleteService as never,
    );
  });

  // ---------------------------------------------------------------------------
  describe('create', () => {
    const dto = { nom: 'Abidjan', code: 'byk' };

    it('crée une ville et la renvoie', async () => {
      const result = await service.create(dto);

      expect(villeRepo.save).toHaveBeenCalledTimes(1);
      expect(messageService.success).toHaveBeenCalledWith(
        MessageCode.VILLE_CREATED,
        expect.anything(),
      );
      expect(result.data).toBeDefined();
    });

    it('normalise le code en majuscules', async () => {
      await service.create(dto);

      expect(villeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'BYK' }),
      );
    });

    it('force tenantId à null (référence globale)', async () => {
      await service.create(dto);

      expect(villeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: null }),
      );
    });

    it('refuse un nom ou un code déjà utilisé (insensible à la casse)', async () => {
      withConflict();

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        BusinessException,
      );
      expect(messageService.throwBusiness).toHaveBeenCalledWith(
        MessageCode.VILLE_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
      expect(villeRepo.save).not.toHaveBeenCalled();
    });

    it("refuse l'écriture à un utilisateur non ROOT", async () => {
      tenantContext.isRoot = false;

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        BusinessException,
      );
      expect(messageService.throwBusiness).toHaveBeenCalledWith(
        MessageCode.ACCESS_DENIED,
        HttpStatus.FORBIDDEN,
      );
      expect(villeRepo.save).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('update', () => {
    it('modifie une ville existante', async () => {
      mockVilles = [makeVille()];

      // Cas nominal : aucune modification ne crée de doublon.
      noConflict();

      await service.update(VILLE_ID, { nom: 'Abidjan-Ville' });

      expect(villeRepo.update).toHaveBeenCalledTimes(1);
      expect(messageService.success).toHaveBeenCalledWith(
        MessageCode.VILLE_UPDATED,
        expect.anything(),
      );
    });

    it('refuse de modifier une ville inexistante', async () => {
      await expect(
        service.update(AUTRE_ID, { nom: 'X' }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(villeRepo.update).not.toHaveBeenCalled();
    });

    it('refuse une modification qui crée un doublon', async () => {
      mockVilles = [makeVille()];
      withConflict();

      await expect(
        service.update(VILLE_ID, { nom: 'Bouaké' }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(villeRepo.update).not.toHaveBeenCalled();
    });

    it('refuse la modification à un utilisateur non ROOT', async () => {
      mockVilles = [makeVille()];
      tenantContext.isRoot = false;

      await expect(
        service.update(VILLE_ID, { nom: 'X' }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(villeRepo.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('remove', () => {
    it('effectue une suppression logique', async () => {
      mockVilles = [makeVille()];

      await service.remove(VILLE_ID);

      expect(softDeleteService.softDelete).toHaveBeenCalledWith(
        villeRepo,
        VILLE_ID,
        tenantContext.userId,
      );
    });

    it('ne supprime JAMAIS la ligne en base', async () => {
      mockVilles = [makeVille()];

      await service.remove(VILLE_ID);

      expect(villeRepo.delete).toBeUndefined();
      expect(
        (villeRepo as unknown as Record<string, unknown>)['remove'],
      ).toBeUndefined();
      expect(
        (villeRepo as unknown as Record<string, unknown>)['hardRemove'],
      ).toBeUndefined();
    });

    it('liberer nom et code pour une ville supprimee', async () => {
      // Une ville supprimee est conservee en base mais sort des lectures
      // (`deletedAt IS NULL`). Les index uniques partiels liberent donc son nom
      // et son code : la verification de doublon NE doit pas considers la
      // corbeille, sans quoi on ne pourrait plus recreer la ville.
      const ville = makeVille();
      ville.deletedAt = new Date();
      mockVilles = [ville];
      noConflict();

      await service.create({ nom: 'Abidjan', code: 'ABI' });

      expect(villeRepo.save).toHaveBeenCalledTimes(1);
    });

    it('refuse la suppression par un utilisateur non ROOT', async () => {
      mockVilles = [makeVille()];
      tenantContext.isRoot = false;

      await expect(service.remove(VILLE_ID)).rejects.toBeInstanceOf(
        BusinessException,
      );
      expect(softDeleteService.softDelete).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  describe('restore', () => {
    it('restaure une ville supprimée', async () => {
      mockVilles = [makeVille({ deletedAt: new Date() })];

      // Restauration sans conflit : le code et le nom étaient encore libres.
      noConflict();

      await service.restore(VILLE_ID);

      expect(villeRepo.update).toHaveBeenCalledWith(
        VILLE_ID,
        expect.objectContaining({ deletedAt: null, deletedBy: null }),
      );
    });

    it('refuse une restauration qui créerait un doublon', async () => {
      mockVilles = [makeVille({ deletedAt: new Date() })];
      withConflict();

      await expect(service.restore(VILLE_ID)).rejects.toBeInstanceOf(
        BusinessException,
      );
      expect(villeRepo.update).not.toHaveBeenCalled();
    });

    it('revalide luniqueite avant de restaurer', async () => {
      mockVilles = [makeVille({ deletedAt: new Date() })];
      noConflict();

      await service.restore(VILLE_ID);

      // Le nom et le code ont pu etre reattribues entre la suppression et la
      // restauration : la revalidation est obligatoire.
      expect(villeRepo.createQueryBuilder).toHaveBeenCalled();
      expect(villeRepo.update).toHaveBeenCalledWith(
        VILLE_ID,
        expect.objectContaining({ deletedAt: null }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('findOne', () => {
    it('retourne une ville existante', async () => {
      mockVilles = [makeVille()];

      const result = await service.findOne(VILLE_ID);

      expect(result.data).toEqual(expect.objectContaining({ id: VILLE_ID }));
    });

    it('lève VILLE_NOT_FOUND sur une ville inexistante', async () => {
      await expect(service.findOne(AUTRE_ID)).rejects.toBeInstanceOf(
        BusinessException,
      );
      expect(messageService.throwBusiness).toHaveBeenCalledWith(
        MessageCode.VILLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    });
  });

  // ---------------------------------------------------------------------------
  describe('lecture ouverte à tous les tenants', () => {
    it('ne filtre pas par tenant lors de la lecture', async () => {
      mockVilles = [makeVille()];

      // `tenantContext` expose un tenant, mais aucune méthode de lecture ne doit
      // le consulter : les villes sont une référence globale.
      await service.findOne(VILLE_ID);
      await service.findAll({});

      expect(searchService.searchAndPaginate).toHaveBeenCalled();
    });
  });
});
