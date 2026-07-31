import express from 'express';
import { prisma } from '../../../utils/prisma';
import { toCsv } from '../../../utils/csv';
import { sendError } from '../../../utils/sendResponse';

function sendCsv(res: express.Response, filename: string, csv: string) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
}

class adminExportsController {
    bookings = async (_req: express.Request, res: express.Response) => {
        try {
            const rows = await prisma.booking.findMany({
                orderBy: { created_at: 'desc' },
                take: 5000,
                include: {
                    user: { select: { name: true, phone_number: true } },
                    service: { select: { title: true } },
                    slot: { select: { duration_label: true, slot_type: true } },
                    payment: { select: { status: true } },
                    staff: { select: { name: true } },
                },
            });
            const csv = toCsv(
                [
                    'id',
                    'status',
                    'payment_status',
                    'customer_name',
                    'customer_phone',
                    'service',
                    'slot',
                    'coupon',
                    'staff',
                    'service_charge',
                    'platform_fee',
                    'discount_amount',
                    'total_amount',
                    'scheduled_at',
                    'created_at',
                ],
                rows.map((r) => [
                    r.id,
                    r.status,
                    r.payment?.status ?? 'NONE',
                    r.user.name ?? '',
                    r.user.phone_number,
                    r.service.title,
                    `${r.slot.duration_label} (${r.slot.slot_type})`,
                    r.applied_coupon_code ?? '',
                    r.staff?.name ?? r.staff_name ?? '',
                    Number(r.service_charge),
                    Number(r.platform_fee),
                    Number(r.discount_amount),
                    Number(r.total_amount),
                    r.scheduled_at?.toISOString() ?? '',
                    r.created_at.toISOString(),
                ]),
            );
            return sendCsv(res, `homez-bookings-${new Date().toISOString().slice(0, 10)}.csv`, csv);
        } catch (e) {
            console.error('[admin exports] bookings', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    users = async (_req: express.Request, res: express.Response) => {
        try {
            const rows = await prisma.users.findMany({
                where: { is_deleted: false },
                orderBy: { created_at: 'desc' },
                take: 5000,
            });
            const csv = toCsv(
                [
                    'id',
                    'name',
                    'phone_number',
                    'gender',
                    'is_active',
                    'is_verified',
                    'is_onboarding_completed',
                    'onboarding_step',
                    'created_at',
                ],
                rows.map((r) => [
                    r.id,
                    r.name ?? '',
                    r.phone_number,
                    r.gender ?? '',
                    r.is_active,
                    r.is_verified,
                    r.is_onboarding_completed,
                    r.onboarding_step,
                    r.created_at.toISOString(),
                ]),
            );
            return sendCsv(res, `homez-users-${new Date().toISOString().slice(0, 10)}.csv`, csv);
        } catch (e) {
            console.error('[admin exports] users', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };

    discounts = async (_req: express.Request, res: express.Response) => {
        try {
            const rows = await prisma.discount.findMany({
                where: { is_deleted: false },
                orderBy: { created_at: 'desc' },
                take: 5000,
            });
            const csv = toCsv(
                [
                    'id',
                    'code',
                    'title',
                    'percentage',
                    'amount',
                    'usage_count',
                    'usage_limit_total',
                    'limit_label',
                    'is_active',
                    'expires_at',
                    'created_at',
                ],
                rows.map((r) => [
                    r.id,
                    r.code,
                    r.title,
                    r.percentage ?? '',
                    r.amount != null ? Number(r.amount) : '',
                    r.usage_count,
                    r.usage_limit_total ?? '',
                    r.limit_label ?? '',
                    r.is_active,
                    r.expires_at.toISOString(),
                    r.created_at.toISOString(),
                ]),
            );
            return sendCsv(res, `homez-coupons-${new Date().toISOString().slice(0, 10)}.csv`, csv);
        } catch (e) {
            console.error('[admin exports] discounts', e);
            return sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR');
        }
    };
}

export default adminExportsController;
