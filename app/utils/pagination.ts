export type PaginationQuery = {
    page: number;
    pageSize: number;
    skip: number;
};

export type PageMeta = {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

export type Paginated<T> = {
    items: T[];
    meta: PageMeta;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Parse `page` / `pageSize` (or `limit`) from Express query. */
export function parsePagination(query: Record<string, unknown>): PaginationQuery {
    const pageRaw = Number(query.page ?? 1);
    const sizeRaw = Number(query.pageSize ?? query.limit ?? DEFAULT_PAGE_SIZE);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const pageSize = Number.isFinite(sizeRaw)
        ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(sizeRaw)))
        : DEFAULT_PAGE_SIZE;
    return { page, pageSize, skip: (page - 1) * pageSize };
}

export function buildPageMeta(total: number, page: number, pageSize: number): PageMeta {
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return { total, page, pageSize, totalPages };
}

export function paginateResult<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
    return { items, meta: buildPageMeta(total, page, pageSize) };
}
