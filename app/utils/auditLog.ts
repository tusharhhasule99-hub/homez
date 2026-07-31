import { prisma } from './prisma';

export type AuditWriteInput = {
    adminId?: string | null;
    adminEmail?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    meta?: Record<string, unknown> | null;
};

export async function writeAuditLog(input: AuditWriteInput): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                admin_id: input.adminId ?? null,
                admin_email: input.adminEmail ?? null,
                action: input.action,
                entity_type: input.entityType,
                entity_id: input.entityId ?? null,
                summary: input.summary,
                meta: (input.meta ?? undefined) as object | undefined,
            },
        });
    } catch (e) {
        console.error('[audit] write failed', e);
    }
}
