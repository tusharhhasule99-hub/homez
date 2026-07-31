import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../utils/prisma';
import { paginateResult } from '../../../utils/pagination';

export type AdminDiscount = {
    id: string;
    title: string;
    code: string;
    percentage: number | null;
    amount: number | null;
    expires_at: string;
    usage_limit_total: number | null;
    usage_count: number;
    uses_remaining: number | null;
    limit_label: string | null;
    is_active: boolean;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
};

function toAmount(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function mapDiscount(row: {
    id: string;
    title: string;
    code: string;
    percentage: number | null;
    amount: unknown;
    expires_at: Date;
    usage_limit_total: number | null;
    usage_count: number;
    limit_label: string | null;
    is_active: boolean;
    is_deleted: boolean;
    created_at: Date;
    updated_at: Date;
}): AdminDiscount {
    const limit = row.usage_limit_total;
    const uses_remaining = limit == null ? null : Math.max(0, limit - row.usage_count);
    return {
        id: row.id,
        title: row.title,
        code: row.code,
        percentage: row.percentage,
        amount: toAmount(row.amount),
        expires_at: row.expires_at.toISOString(),
        usage_limit_total: limit,
        usage_count: row.usage_count,
        uses_remaining,
        limit_label: row.limit_label,
        is_active: row.is_active,
        is_deleted: row.is_deleted,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
    };
}

function parseDiscountBody(
    body: Record<string, unknown>,
    partial: boolean,
):
    | { ok: true; data: Prisma.DiscountCreateInput | Prisma.DiscountUpdateInput }
    | { ok: false; message: string } {
    const data: Record<string, unknown> = {};

    if ('title' in body) {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) return { ok: false, message: 'title is required.' };
        data.title = title;
    } else if (!partial) {
        return { ok: false, message: 'title is required.' };
    }

    if ('code' in body) {
        const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
        if (!code || !/^[A-Z0-9_-]{3,32}$/.test(code)) {
            return {
                ok: false,
                message: 'code must be 3–32 chars (A–Z, 0–9, _ or -).',
            };
        }
        data.code = code;
    } else if (!partial) {
        return { ok: false, message: 'code is required.' };
    }

    if ('percentage' in body) {
        if (body.percentage === null || body.percentage === '') {
            data.percentage = null;
        } else {
            const p = Number(body.percentage);
            if (!Number.isFinite(p) || p < 1 || p > 100 || Math.floor(p) !== p) {
                return { ok: false, message: 'percentage must be an integer from 1 to 100, or null.' };
            }
            data.percentage = p;
        }
    }

    if ('amount' in body) {
        if (body.amount === null || body.amount === '') {
            data.amount = null;
        } else {
            const a = Number(body.amount);
            if (!Number.isFinite(a) || a < 0) {
                return { ok: false, message: 'amount must be a non-negative number, or null.' };
            }
            data.amount = a;
        }
    }

    if ('expires_at' in body) {
        const raw = String(body.expires_at ?? '').trim();
        const d = new Date(raw);
        if (!raw || Number.isNaN(d.getTime())) {
            return { ok: false, message: 'expires_at must be a valid date.' };
        }
        data.expires_at = d;
    } else if (!partial) {
        return { ok: false, message: 'expires_at is required.' };
    }

    if ('usage_limit_total' in body) {
        if (body.usage_limit_total === null || body.usage_limit_total === '') {
            data.usage_limit_total = null;
        } else {
            const n = Number(body.usage_limit_total);
            if (!Number.isFinite(n) || n < 1 || Math.floor(n) !== n) {
                return { ok: false, message: 'usage_limit_total must be a positive integer, or null (unlimited).' };
            }
            data.usage_limit_total = n;
        }
    }

    if ('limit_label' in body) {
        data.limit_label =
            typeof body.limit_label === 'string' && body.limit_label.trim()
                ? body.limit_label.trim()
                : null;
    }

    if ('is_active' in body && typeof body.is_active === 'boolean') {
        data.is_active = body.is_active;
    }

    if (!partial) {
        const percentage = ('percentage' in data ? data.percentage : null) as number | null;
        const amount = ('amount' in data ? data.amount : null) as number | null;
        if (percentage == null && amount == null) {
            return { ok: false, message: 'Set percentage and/or amount.' };
        }
    }

    return { ok: true, data: data as Prisma.DiscountCreateInput };
}

class adminDiscountsService {
    list = async (opts: {
        page: number;
        pageSize: number;
        skip: number;
        q?: string | null;
        includeDeleted?: boolean;
        is_active?: boolean | null;
    }) => {
        try {
            const where: Prisma.DiscountWhereInput = {};
            if (!opts.includeDeleted) where.is_deleted = false;
            if (opts.is_active != null) where.is_active = opts.is_active;
            if (opts.q?.trim()) {
                const q = opts.q.trim();
                where.OR = [
                    { title: { contains: q, mode: 'insensitive' } },
                    { code: { contains: q, mode: 'insensitive' } },
                    { limit_label: { contains: q, mode: 'insensitive' } },
                ];
            }

            const [total, rows] = await Promise.all([
                prisma.discount.count({ where }),
                prisma.discount.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    skip: opts.skip,
                    take: opts.pageSize,
                }),
            ]);

            return {
                success: true as const,
                message: 'OK',
                data: paginateResult(rows.map(mapDiscount), total, opts.page, opts.pageSize),
            };
        } catch (e) {
            console.error('[admin discounts] list', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    getById = async (id: string) => {
        try {
            const row = await prisma.discount.findFirst({ where: { id } });
            if (!row) {
                return { success: false as const, message: 'Discount not found.', code: 'NOT_FOUND' as const };
            }
            return { success: true as const, message: 'OK', data: mapDiscount(row) };
        } catch (e) {
            console.error('[admin discounts] getById', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    create = async (body: Record<string, unknown>) => {
        const parsed = parseDiscountBody(body, false);
        if (!parsed.ok) {
            return { success: false as const, message: parsed.message, code: 'VALIDATION' as const };
        }

        try {
            const code = (parsed.data as Prisma.DiscountCreateInput).code as string;
            const dup = await prisma.discount.findUnique({ where: { code } });
            if (dup && !dup.is_deleted) {
                return {
                    success: false as const,
                    message: 'A discount with this code already exists.',
                    code: 'DUPLICATE_CODE' as const,
                };
            }

            if (dup?.is_deleted) {
                const restored = await prisma.discount.update({
                    where: { id: dup.id },
                    data: {
                        ...(parsed.data as Prisma.DiscountUpdateInput),
                        usage_count: 0,
                        is_deleted: false,
                        is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
                    },
                });
                return { success: true as const, message: 'Discount created.', data: mapDiscount(restored) };
            }

            const created = await prisma.discount.create({
                data: {
                    ...(parsed.data as Prisma.DiscountCreateInput),
                    is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
                    is_deleted: false,
                    usage_count: 0,
                },
            });
            return { success: true as const, message: 'Discount created.', data: mapDiscount(created) };
        } catch (e) {
            console.error('[admin discounts] create', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    update = async (id: string, body: Record<string, unknown>) => {
        const parsed = parseDiscountBody(body, true);
        if (!parsed.ok) {
            return { success: false as const, message: parsed.message, code: 'VALIDATION' as const };
        }

        try {
            const existing = await prisma.discount.findFirst({ where: { id, is_deleted: false } });
            if (!existing) {
                return { success: false as const, message: 'Discount not found.', code: 'NOT_FOUND' as const };
            }

            if ('code' in parsed.data) {
                const nextCode = (parsed.data as { code?: string }).code;
                if (nextCode && nextCode !== existing.code) {
                    const dup = await prisma.discount.findFirst({
                        where: { code: nextCode, NOT: { id } },
                    });
                    if (dup) {
                        return {
                            success: false as const,
                            message: 'Another discount already uses this code.',
                            code: 'DUPLICATE_CODE' as const,
                        };
                    }
                }
            }

            const nextPercentage =
                'percentage' in parsed.data
                    ? ((parsed.data as { percentage?: number | null }).percentage ?? null)
                    : existing.percentage;
            const nextAmount =
                'amount' in parsed.data
                    ? toAmount((parsed.data as { amount?: unknown }).amount)
                    : toAmount(existing.amount);
            if (nextPercentage == null && nextAmount == null) {
                return {
                    success: false as const,
                    message: 'Set percentage and/or amount.',
                    code: 'VALIDATION' as const,
                };
            }

            if ('is_deleted' in body && typeof body.is_deleted === 'boolean') {
                (parsed.data as Prisma.DiscountUpdateInput).is_deleted = body.is_deleted;
            }

            const updated = await prisma.discount.update({
                where: { id },
                data: parsed.data as Prisma.DiscountUpdateInput,
            });
            return { success: true as const, message: 'Discount updated.', data: mapDiscount(updated) };
        } catch (e) {
            console.error('[admin discounts] update', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    softDelete = async (id: string) => {
        try {
            const existing = await prisma.discount.findFirst({ where: { id, is_deleted: false } });
            if (!existing) {
                return { success: false as const, message: 'Discount not found.', code: 'NOT_FOUND' as const };
            }
            const updated = await prisma.discount.update({
                where: { id },
                data: { is_deleted: true, is_active: false },
            });
            return { success: true as const, message: 'Discount deleted.', data: mapDiscount(updated) };
        } catch (e) {
            console.error('[admin discounts] softDelete', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    usageStats = async () => {
        try {
            const rows = await prisma.discount.findMany({
                where: { is_deleted: false },
                orderBy: { usage_count: 'desc' },
                take: 20,
                select: {
                    id: true,
                    code: true,
                    title: true,
                    usage_count: true,
                    usage_limit_total: true,
                    is_active: true,
                    expires_at: true,
                },
            });
            const data = rows.map((r) => ({
                id: r.id,
                code: r.code,
                title: r.title,
                usage_count: r.usage_count,
                usage_limit_total: r.usage_limit_total,
                uses_remaining:
                    r.usage_limit_total == null ? null : Math.max(0, r.usage_limit_total - r.usage_count),
                is_active: r.is_active,
                expires_at: r.expires_at.toISOString(),
            }));
            return { success: true as const, message: 'OK', data };
        } catch (e) {
            console.error('[admin discounts] usageStats', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminDiscountsService;
