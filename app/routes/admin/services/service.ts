import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../utils/prisma';

const adminServiceInclude = {
    slots: { orderBy: { sort_order: 'asc' as const } },
    _count: { select: { bookings: true } },
} as const;

type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof adminServiceInclude }>;

export type AdminServiceSlot = {
    id: string;
    slot_type: 'instant' | 'scheduled';
    duration_label: string;
    duration_minutes: number;
    price: number;
    slash_price: number | null;
    sort_order: number;
    is_active: boolean;
    is_deleted: boolean;
};

export type AdminService = {
    id: string;
    slug: string;
    title: string;
    description: string;
    image_url: string;
    dos: string[];
    donts: string[];
    sort_order: number;
    is_active: boolean;
    is_deleted: boolean;
    bookings_count: number;
    slots: AdminServiceSlot[];
    created_at: string;
    updated_at: string;
};

function asStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
}

function toNum(d: unknown): number | null {
    if (d === null || d === undefined) return null;
    return Number(d);
}

function mapService(row: ServiceRow): AdminService {
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        image_url: row.image_url,
        dos: asStringList(row.dos),
        donts: asStringList(row.donts),
        sort_order: row.sort_order,
        is_active: row.is_active,
        is_deleted: row.is_deleted,
        bookings_count: row._count.bookings,
        slots: row.slots.map((s) => ({
            id: s.id,
            slot_type: s.slot_type,
            duration_label: s.duration_label,
            duration_minutes: s.duration_minutes,
            price: toNum(s.price)!,
            slash_price: toNum(s.slash_price),
            sort_order: s.sort_order,
            is_active: s.is_active,
            is_deleted: s.is_deleted,
        })),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
    };
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function validateService(body: Record<string, unknown>, partial: boolean):
    | { ok: true; data: Partial<Prisma.ServiceCreateInput> }
    | { ok: false; message: string } {
    const data: Partial<Prisma.ServiceCreateInput> = {};

    if ('slug' in body) {
        const slug = String(body.slug ?? '').trim().toLowerCase();
        if (!SLUG_RE.test(slug)) return { ok: false, message: 'slug must be lowercase letters, numbers, or hyphens.' };
        data.slug = slug;
    } else if (!partial) return { ok: false, message: 'slug is required.' };

    if ('title' in body) {
        const title = String(body.title ?? '').trim();
        if (!title) return { ok: false, message: 'title is required.' };
        data.title = title;
    } else if (!partial) return { ok: false, message: 'title is required.' };

    if ('description' in body) {
        const description = String(body.description ?? '').trim();
        if (!description) return { ok: false, message: 'description is required.' };
        data.description = description;
    } else if (!partial) return { ok: false, message: 'description is required.' };

    if ('image_url' in body) {
        const image_url = String(body.image_url ?? '').trim();
        if (!image_url) return { ok: false, message: 'image_url is required.' };
        data.image_url = image_url;
    } else if (!partial) return { ok: false, message: 'image_url is required.' };

    if ('dos' in body) data.dos = asStringList(body.dos) as unknown as Prisma.InputJsonValue;
    if ('donts' in body) data.donts = asStringList(body.donts) as unknown as Prisma.InputJsonValue;
    if ('sort_order' in body) {
        const n = Number(body.sort_order);
        if (!Number.isFinite(n)) return { ok: false, message: 'sort_order must be a number.' };
        data.sort_order = Math.trunc(n);
    }
    if ('is_active' in body && typeof body.is_active === 'boolean') data.is_active = body.is_active;

    return { ok: true, data };
}

class adminServicesService {
    list = async (opts: { includeDeleted: boolean }) => {
        try {
            const where: Prisma.ServiceWhereInput = opts.includeDeleted ? {} : { is_deleted: false };
            const rows = await prisma.service.findMany({
                where,
                orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
                include: adminServiceInclude,
            });
            return { success: true as const, message: 'OK', data: rows.map(mapService) };
        } catch (e) {
            console.error('[admin services] list', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    getById = async (id: string) => {
        try {
            const row = await prisma.service.findFirst({
                where: { id },
                include: adminServiceInclude,
            });
            if (!row) {
                return { success: false as const, message: 'Service not found.', code: 'NOT_FOUND' as const };
            }
            return { success: true as const, message: 'OK', data: mapService(row) };
        } catch (e) {
            console.error('[admin services] getById', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    create = async (body: Record<string, unknown>) => {
        const parsed = validateService(body, false);
        if (!parsed.ok) return { success: false as const, message: parsed.message, code: 'VALIDATION' as const };

        try {
            const dup = await prisma.service.findUnique({ where: { slug: parsed.data.slug! } });
            if (dup) {
                return {
                    success: false as const,
                    message: 'A service with this slug already exists.',
                    code: 'DUPLICATE_SLUG' as const,
                };
            }
            const created = await prisma.service.create({
                data: parsed.data as Prisma.ServiceCreateInput,
                include: adminServiceInclude,
            });
            return { success: true as const, message: 'Service created.', data: mapService(created) };
        } catch (e) {
            console.error('[admin services] create', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    update = async (id: string, body: Record<string, unknown>) => {
        const parsed = validateService(body, true);
        if (!parsed.ok) return { success: false as const, message: parsed.message, code: 'VALIDATION' as const };

        try {
            const existing = await prisma.service.findFirst({ where: { id } });
            if (!existing) {
                return { success: false as const, message: 'Service not found.', code: 'NOT_FOUND' as const };
            }
            if (parsed.data.slug && parsed.data.slug !== existing.slug) {
                const dup = await prisma.service.findFirst({
                    where: { slug: parsed.data.slug, NOT: { id } },
                });
                if (dup) {
                    return {
                        success: false as const,
                        message: 'Another service already uses this slug.',
                        code: 'DUPLICATE_SLUG' as const,
                    };
                }
            }
            await prisma.service.update({ where: { id }, data: parsed.data });
            const row = await prisma.service.findFirstOrThrow({ where: { id }, include: adminServiceInclude });
            return { success: true as const, message: 'Service updated.', data: mapService(row) };
        } catch (e) {
            console.error('[admin services] update', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    softDelete = async (id: string) => {
        try {
            const existing = await prisma.service.findFirst({ where: { id } });
            if (!existing) {
                return { success: false as const, message: 'Service not found.', code: 'NOT_FOUND' as const };
            }
            await prisma.service.update({
                where: { id },
                data: { is_deleted: true, is_active: false },
            });
            return { success: true as const, message: 'Service deleted.' };
        } catch (e) {
            console.error('[admin services] delete', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminServicesService;
