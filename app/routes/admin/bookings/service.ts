import type { Prisma } from '../../../generated/prisma/client';
import { BookingStatus } from '../../../generated/prisma/enums';
import { prisma } from '../../../utils/prisma';
import { paginateResult } from '../../../utils/pagination';

const ALL_STATUSES: BookingStatus[] = [
    BookingStatus.CREATED,
    BookingStatus.AWAITING_STAFF,
    BookingStatus.ACCEPTED,
    BookingStatus.REJECTED,
    BookingStatus.ASSIGNING_STAFF,
    BookingStatus.STAFF_EN_ROUTE,
    BookingStatus.ARRIVED,
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
];

const TERMINAL: BookingStatus[] = [BookingStatus.REJECTED, BookingStatus.COMPLETED, BookingStatus.CANCELLED];

const ALLOWED_NEXT: Record<BookingStatus, BookingStatus[]> = {
    [BookingStatus.CREATED]: [BookingStatus.AWAITING_STAFF, BookingStatus.ACCEPTED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
    [BookingStatus.AWAITING_STAFF]: [BookingStatus.ACCEPTED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
    [BookingStatus.ACCEPTED]: [BookingStatus.ASSIGNING_STAFF, BookingStatus.REJECTED, BookingStatus.CANCELLED],
    [BookingStatus.ASSIGNING_STAFF]: [BookingStatus.STAFF_EN_ROUTE, BookingStatus.CANCELLED],
    [BookingStatus.STAFF_EN_ROUTE]: [BookingStatus.ARRIVED, BookingStatus.CANCELLED],
    [BookingStatus.ARRIVED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
    [BookingStatus.REJECTED]: [],
    [BookingStatus.COMPLETED]: [],
    [BookingStatus.CANCELLED]: [],
};

const adminBookingInclude = {
    service: { select: { id: true, title: true } },
    slot: { select: { id: true, duration_label: true, slot_type: true } },
    address: { select: { id: true, label: true, line1: true, area: true, city: true, pincode: true } },
    user: { select: { id: true, name: true, phone_number: true } },
} as const;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof adminBookingInclude }>;

export type AdminBooking = {
    id: string;
    status: BookingStatus;
    service_charge: number;
    platform_fee: number;
    discount_amount: number;
    total_amount: number;
    applied_coupon_code: string | null;
    payment_method: string | null;
    staff_name: string | null;
    scheduled_at: string | null;
    rating: number | null;
    rating_comment: string | null;
    rated_at: string | null;
    created_at: string;
    updated_at: string;
    user: { id: string; name: string | null; phone_number: string };
    service: { id: string; title: string };
    slot: { id: string; duration_label: string; slot_type: string };
    address: { id: string; label: string; line1: string; area: string; city: string; pincode: string };
};

function toNum(d: unknown): number {
    if (typeof d === 'number') return d;
    return Number(d);
}

function mapBooking(row: BookingRow): AdminBooking {
    return {
        id: row.id,
        status: row.status,
        service_charge: toNum(row.service_charge),
        platform_fee: toNum(row.platform_fee),
        discount_amount: toNum(row.discount_amount),
        total_amount: toNum(row.total_amount),
        applied_coupon_code: row.applied_coupon_code,
        payment_method: row.payment_method,
        staff_name: row.staff_name,
        scheduled_at: row.scheduled_at?.toISOString() ?? null,
        rating: row.rating,
        rating_comment: row.rating_comment,
        rated_at: row.rated_at?.toISOString() ?? null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        user: { id: row.user.id, name: row.user.name, phone_number: row.user.phone_number },
        service: { id: row.service.id, title: row.service.title },
        slot: { id: row.slot.id, duration_label: row.slot.duration_label, slot_type: row.slot.slot_type },
        address: {
            id: row.address.id,
            label: row.address.label,
            line1: row.address.line1,
            area: row.address.area,
            city: row.address.city,
            pincode: row.address.pincode,
        },
    };
}

class adminBookingsService {
    list = async (opts: {
        status?: BookingStatus | null;
        userId?: string | null;
        q?: string | null;
        page: number;
        pageSize: number;
        skip: number;
    }) => {
        try {
            const where: Prisma.BookingWhereInput = {};
            if (opts.status) where.status = opts.status;
            if (opts.userId) where.user_id = opts.userId;
            if (opts.q?.trim()) {
                const q = opts.q.trim();
                where.OR = [
                    { id: { contains: q, mode: 'insensitive' } },
                    { applied_coupon_code: { contains: q, mode: 'insensitive' } },
                    { staff_name: { contains: q, mode: 'insensitive' } },
                    { user: { name: { contains: q, mode: 'insensitive' } } },
                    { user: { phone_number: { contains: q } } },
                    { service: { title: { contains: q, mode: 'insensitive' } } },
                ];
            }

            const [total, rows] = await Promise.all([
                prisma.booking.count({ where }),
                prisma.booking.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    skip: opts.skip,
                    take: opts.pageSize,
                    include: adminBookingInclude,
                }),
            ]);
            return {
                success: true as const,
                message: 'OK',
                data: paginateResult(rows.map(mapBooking), total, opts.page, opts.pageSize),
            };
        } catch (e) {
            console.error('[admin bookings] list', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    getById = async (id: string) => {
        try {
            const row = await prisma.booking.findFirst({
                where: { id },
                include: adminBookingInclude,
            });
            if (!row) {
                return { success: false as const, message: 'Booking not found.', code: 'NOT_FOUND' as const };
            }
            return { success: true as const, message: 'OK', data: mapBooking(row) };
        } catch (e) {
            console.error('[admin bookings] getById', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    updateStatus = async (id: string, statusRaw: unknown, staffName?: unknown) => {
        try {
            if (typeof statusRaw !== 'string' || !statusRaw.trim()) {
                return { success: false as const, message: 'status is required.', code: 'VALIDATION' as const };
            }
            const normalized = statusRaw.trim().toUpperCase().replace(/ /g, '_');
            const target = ALL_STATUSES.find((s) => s === normalized);
            if (!target) {
                return {
                    success: false as const,
                    message: `status must be one of ${ALL_STATUSES.join(', ')}.`,
                    code: 'VALIDATION' as const,
                };
            }

            const existing = await prisma.booking.findFirst({ where: { id } });
            if (!existing) {
                return { success: false as const, message: 'Booking not found.', code: 'NOT_FOUND' as const };
            }
            if (TERMINAL.includes(existing.status)) {
                return {
                    success: false as const,
                    message: 'This booking is in a terminal state and cannot change status.',
                    code: 'INVALID' as const,
                };
            }
            if (existing.status !== target && !ALLOWED_NEXT[existing.status]?.includes(target)) {
                return {
                    success: false as const,
                    message: `Cannot move from ${existing.status} to ${target}.`,
                    code: 'INVALID' as const,
                };
            }

            const data: Prisma.BookingUpdateInput = { status: target };
            if (typeof staffName === 'string' && staffName.trim()) {
                data.staff_name = staffName.trim();
            }

            await prisma.booking.update({ where: { id }, data });
            const row = await prisma.booking.findFirstOrThrow({ where: { id }, include: adminBookingInclude });
            return { success: true as const, message: 'Booking updated.', data: mapBooking(row) };
        } catch (e) {
            console.error('[admin bookings] updateStatus', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminBookingsService;
