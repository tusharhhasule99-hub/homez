import { prisma } from '../../../utils/prisma';
import { paginateResult } from '../../../utils/pagination';

class adminAuditService {
    list = async (opts: {
        page: number;
        pageSize: number;
        skip: number;
        q?: string | null;
        entityType?: string | null;
    }) => {
        try {
            const where: {
                OR?: { summary?: { contains: string; mode: 'insensitive' }; action?: { contains: string; mode: 'insensitive' }; admin_email?: { contains: string; mode: 'insensitive' }; entity_id?: { contains: string; mode: 'insensitive' } }[];
                entity_type?: string;
            } = {};
            if (opts.entityType?.trim()) where.entity_type = opts.entityType.trim();
            if (opts.q?.trim()) {
                const q = opts.q.trim();
                where.OR = [
                    { summary: { contains: q, mode: 'insensitive' } },
                    { action: { contains: q, mode: 'insensitive' } },
                    { admin_email: { contains: q, mode: 'insensitive' } },
                    { entity_id: { contains: q, mode: 'insensitive' } },
                ];
            }

            const [total, rows] = await Promise.all([
                prisma.auditLog.count({ where }),
                prisma.auditLog.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    skip: opts.skip,
                    take: opts.pageSize,
                }),
            ]);

            const items = rows.map((r) => ({
                id: r.id,
                admin_id: r.admin_id,
                admin_email: r.admin_email,
                action: r.action,
                entity_type: r.entity_type,
                entity_id: r.entity_id,
                summary: r.summary,
                meta: r.meta,
                created_at: r.created_at.toISOString(),
            }));

            return {
                success: true as const,
                message: 'OK',
                data: paginateResult(items, total, opts.page, opts.pageSize),
            };
        } catch (e) {
            console.error('[admin audit] list', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminAuditService;
