import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Ville } from './entities/ville.entity';
import { CreateVilleDto } from './dto/create-ville.dto';
import { UpdateVilleDto } from './dto/update-ville.dto';
import { VilleSearchFilterDto } from './dto/ville-search-filter.dto';
import { PaginatedResponseDto } from '../../common/responses/paginated-response.dto';
import { ApiResponse } from '../../common/responses/api-response.interface';
import { MessageService } from '../../common/messages/message.service';
import { MessageCode } from '../../common/messages/message.codes';
import { TenantContextService } from '../tenants/tenant-context.service';
import { SearchService } from '../../common/services/search.service';
import { SoftDeleteService } from '../../common/services/soft-delete.service';

/**
 * Champs sur lesquels porte la recherche plein texte (`ILIKE`).
 * Volontairement limité à l'identifiant et à la division administrative :
 * `codePostal` est exclu (trop court, trop peu discriminant).
 */
const SEARCH_FIELDS = ['nom', 'code', 'region', 'departement'];

/** Valeurs normalisées lors d'une création ou d'une mise à jour. */
interface VilleNormalized {
  nom?: string;
  code?: string;
  region?: string | null;
  departement?: string | null;
  codePostal?: string | null;
  actif?: boolean;
}

/** Bases des liens de pagination retournés dans `meta`/`links`. */
const BASE_URL = '/api/v1/villes';
const BASE_URL_DELETED = '/api/v1/villes/deleted';

/**
 * Service de gestion des villes.
 *
 * Les villes sont une RÉFÉRENCE GLOBALE (`tenant_id` toujours `null`) : elles ne
 * sont donc jamais filtrées par tenant, à la différence de `UsersService` ou
 * `RolesService`. Aucun `tenantId` n'est lu ni accepté depuis le client.
 *
 * Règles d'accès :
 * - **lecture** : ouverte à tout utilisateur authentifié (`@Permissions('VILE:READ')`) ;
 * - **écriture** : réservée au ROOT. Le contrôle est appliqué ici, dans le
 *   service, et pas seulement via l'annotation du controller : une ville étant
 *   partagée par tous les tenants, y accorder l'écriture reviendrait à laisser
 *   un tenant altérer la référence commune. Même approche que
 *   `UsersService.hardDeleteUser`.
 */
@Injectable()
export class VilleService {
  constructor(
    @InjectRepository(Ville) private readonly villeRepo: Repository<Ville>,
    private readonly messageService: MessageService,
    private readonly tenantContext: TenantContextService,
    private readonly searchService: SearchService,
    private readonly softDeleteService: SoftDeleteService,
  ) {}

  // ---------------------------------------------------------------------------
  // Règles métier
  // ---------------------------------------------------------------------------

  /**
   * L'écriture d'une donnée de référence globale est réservée au ROOT.
   *
   * Défense explicite, indépendante des permissions : le code ROOT est un rôle
   * à portée fonctionnelle générale, et `PermissionGuard` laisse passer l'ROOT
   * sans vérifier les permissions. Le contrôle est donc refait ici sur
   * `tenantContext.isRoot`, seul point de vérité serveur.
   */
  private assertGlobalReferenceWriter(): void {
    if (!this.tenantContext.isRoot) {
      this.messageService.throwBusiness(
        MessageCode.ACCESS_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * Normalisation des saisies : le code est mis en majuscules et les espaces
   * de début/fin sont retirés, afin que ` abidjan `, `Abidjan` et `ABIDJAN`
   * soient refusés comme doublons par la recherche insensible à la casse.
   */
  private normalize(payload: {
    nom?: string;
    code?: string;
    region?: string;
    departement?: string;
    codePostal?: string;
  }): VilleNormalized {
    const normalized: VilleNormalized = {};
    if (payload.nom !== undefined) normalized.nom = payload.nom.trim();
    if (payload.code !== undefined) {
      normalized.code = payload.code.trim().toUpperCase();
    }
    if (payload.region !== undefined) {
      normalized.region = payload.region.trim() || null;
    }
    if (payload.departement !== undefined) {
      normalized.departement = payload.departement.trim() || null;
    }
    if (payload.codePostal !== undefined) {
      normalized.codePostal = payload.codePostal.trim() || null;
    }
    return normalized;
  }

  /**
   * Détecte un doublon de `nom` ou de `code`, insensible à la casse.
   *
   * Cette vérification est un confort d'IH, PAS une garantie d'unicité : deux
   * requêtes concurrentes peuvent toutes deux la passer. L'unicité réelle est
   * garantie par les index uniques fonctionnels `LOWER(code)` et `LOWER(nom)`
   * créés par la migration `1764000000000-CreateVilleTable`. La violation se
   * traduit alors par une `QueryFailedError` PostgreSQL (code `23505`),
   * convertie en conflit HTTP par `HttpExceptionFilter.mapDbError`.
   *
   * @param excludeId Ignorer cette ville (contrôle de mise à jour).
   */
  private async assertNoDuplicate(
    nom: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await this.villeRepo
      .createQueryBuilder('ville')
      .select('ville.id')
      .where('ville.deletedAt IS NULL')
      .andWhere('(LOWER(ville.code) = :code OR LOWER(ville.nom) = :nom)', {
        code: code.trim().toLowerCase(),
        nom: nom.trim().toLowerCase(),
      })
      .andWhere(excludeId ? 'ville.id != :excludeId' : '1 = 1', {
        excludeId,
      })
      .getOne();

    if (conflict) {
      this.messageService.throwBusiness(
        MessageCode.VILLE_ALREADY_EXISTS,
        HttpStatus.CONFLICT,
      );
    }
  }

  /**
   * Récupère une ville non supprimée.
   *
   * `deletedAt` est un `@Column` simple (cf. `BaseAuditEntity`) et NON un
   * `@DeleteDateColumn` : TypeORM n'exclut donc PAS automatiquement les
   * enregistrements supprimés. Le filtre est explicite ici — c'est volontaire,
   * à la différence de `RolesService.findOne` qui laisse passer les rôles
   * supprimés.
   */
  private async getVilleOrThrow(id: string): Promise<Ville> {
    const ville = await this.villeRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!ville) {
      this.messageService.throwBusiness(
        MessageCode.VILLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    return ville;
  }

  // ---------------------------------------------------------------------------
  // Consultation
  // ---------------------------------------------------------------------------

  /** Recherche paginée des villes actives et inactives. */
  async findAll(
    filter: VilleSearchFilterDto,
  ): Promise<PaginatedResponseDto<Ville>> {
    return this.searchVilles(filter, BASE_URL);
  }

  /** Corbeille : villes supprimées logiquement. */
  async findDeleted(
    filter: VilleSearchFilterDto,
  ): Promise<PaginatedResponseDto<Ville>> {
    return this.searchVilles(filter, BASE_URL_DELETED, true);
  }

  private searchVilles(
    filter: VilleSearchFilterDto,
    baseUrl: string,
    onlyDeleted = false,
  ): Promise<PaginatedResponseDto<Ville>> {
    return this.searchService.searchAndPaginate(
      this.villeRepo,
      filter,
      SEARCH_FIELDS,
      baseUrl,
      'ville',
      {
        onlyDeleted,
        scope: (qb) => {
          if (filter.region) {
            qb.andWhere('LOWER(ville.region) = LOWER(:region)', {
              region: filter.region,
            });
          }
          if (filter.departement) {
            qb.andWhere('LOWER(ville.departement) = LOWER(:departement)', {
              departement: filter.departement,
            });
          }
          if (filter.actif !== undefined) {
            qb.andWhere('ville.actif = :actif', { actif: filter.actif });
          }
        },
      },
    );
  }

  /** Détail d'une ville. */
  async findOne(id: string): Promise<ApiResponse<Ville>> {
    const ville = await this.getVilleOrThrow(id);
    return this.messageService.success(MessageCode.VILLE_LIST, ville);
  }

  // ---------------------------------------------------------------------------
  // Écriture (réservée au ROOT)
  // ---------------------------------------------------------------------------

  async create(dto: CreateVilleDto): Promise<ApiResponse<Ville>> {
    this.assertGlobalReferenceWriter();

    const normalized = this.normalize(dto);
    const nom = normalized['nom'] as string;
    const code = normalized['code'] as string;

    await this.assertNoDuplicate(nom, code);

    // `tenantId` est forcé à `null` : une ville est une référence globale. Le
    // DTO n'expose aucun `tenantId`, et aucune valeur client n'est reprise ici.
    const ville = this.villeRepo.create({
      ...normalized,
      tenantId: null,
      actif: dto.actif ?? true,
      createdBy: this.tenantContext.userId,
    });

    const saved = await this.villeRepo.save(ville);
    return this.messageService.success(MessageCode.VILLE_CREATED, saved);
  }

  async update(id: string, dto: UpdateVilleDto): Promise<ApiResponse<Ville>> {
    this.assertGlobalReferenceWriter();
    await this.getVilleOrThrow(id);

    const normalized = this.normalize(dto);

    // Le contrôle de doublon ne porte que sur les champs effectivement fournis :
    // sans `nom` ni `code` dans le payload, il n'y a rien à comparer.
    if (normalized.nom !== undefined || normalized.code !== undefined) {
      const current = await this.getVilleOrThrow(id);
      await this.assertNoDuplicate(
        normalized.nom ?? current.nom,
        normalized.code ?? current.code,
        id,
      );
    }

    if (dto.actif !== undefined) {
      normalized.actif = dto.actif;
    }

    await this.villeRepo.update(id, {
      ...normalized,
      updatedBy: this.tenantContext.userId,
    });

    const updated = await this.getVilleOrThrow(id);
    return this.messageService.success(MessageCode.VILLE_UPDATED, updated);
  }

  /**
   * Suppression logique.
   *
   * Le soft delete est la seule suppression exposée : une ville est une donnée
   * de référence appelée par les modules métier à venir (gares, trajets,
   * chauffeurs). Une suppression physique romprait ces références ; la
   * désactivation via `PUT /villes/:id { "actif": false }` est le moyen
   * privilégié de retirer une ville des listes sans la supprimer.
   */
  async remove(id: string): Promise<ApiResponse<null>> {
    this.assertGlobalReferenceWriter();
    await this.getVilleOrThrow(id);
    await this.softDeleteService.softDelete(
      this.villeRepo,
      id,
      this.tenantContext.userId,
    );
    return this.messageService.success(MessageCode.VILLE_DELETED, null);
  }

  /** Restaure une ville depuis la corbeille. */
  async restore(id: string): Promise<ApiResponse<Ville>> {
    this.assertGlobalReferenceWriter();

    const ville = await this.villeRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!ville) {
      this.messageService.throwBusiness(
        MessageCode.VILLE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    // Un code/nom freed par la suppression logique peut être réutilisé par une
    // autre ville entre-temps : la restauration doit revalider l'unicité.
    await this.assertNoDuplicate(ville.nom, ville.code, id);

    await this.villeRepo.update(id, {
      deletedAt: null,
      deletedBy: null,
      updatedBy: this.tenantContext.userId,
    });

    const restored = await this.getVilleOrThrow(id);
    return this.messageService.success(MessageCode.VILLE_RESTORED, restored);
  }
}
