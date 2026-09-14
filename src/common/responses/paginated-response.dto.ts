/**
 * Métadonnées de pagination incluses dans chaque réponse paginée.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Liens de navigation pour la pagination (HATEOAS léger).
 */
export interface PaginationLinks {
  first: string;
  previous: string | null;
  next: string | null;
  last: string;
}

/**
 * Réponse paginée standardisée.
 * Le format s'aligne sur le pattern efarmOS : meta + links + data.
 */
export class PaginatedResponseDto<T> {
  readonly data: T[];
  readonly meta: PaginationMeta;
  readonly links: PaginationLinks;

  constructor(
    data: T[],
    total: number,
    page: number,
    limit: number,
    baseUrl: string,
  ) {
    const totalPages = Math.ceil(total / limit) || 1;

    this.data = data;
    this.meta = {
      page,
      limit,
      total,
      totalPages,
    };
    this.links = {
      first: `${baseUrl}?page=1&limit=${limit}`,
      previous: page > 1 ? `${baseUrl}?page=${page - 1}&limit=${limit}` : null,
      next:
        page < totalPages ? `${baseUrl}?page=${page + 1}&limit=${limit}` : null,
      last: `${baseUrl}?page=${totalPages}&limit=${limit}`,
    };
  }
}
