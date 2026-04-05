import { prisma } from '../../utils/prisma';
import { loadApplicableDiscountRow } from '../discounts/service';
import type { Booking, Service, Slot, Address } from '../../generated/prisma/client';
import { BookingStatus } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';

const PLATFORM_FEE_INR = () => Number(process.env.PLATFORM_FEE_INR ?? 20);

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function toNum(d: Prisma.Decimal | number): number {
    return typeof d === 'number' ? d : Number(d);
}

/** Percentage applies to service charge only; fixed `amount` applies in addition; total discount capped at subtotal. */
function computeDiscountAmount(
    row: { percentage: number | null; amount: unknown },
    serviceCharge: number,
    platformFee: number,
): number {
    const sub = round2(serviceCharge + platformFee);
    let off = 0;
    if (row.percentage != null) {
        off += round2((serviceCharge * row.percentage) / 100);
    }
    const fixed = row.amount != null ? Number(row.amount) : 0;
    if (fixed > 0) {
        off += fixed;
    }
    return round2(Math.min(off, sub));
}

const TERMINAL: BookingStatus[] = [BookingStatus.REJECTED, BookingStatus.COMPLETED, BookingStatus.CANCELLED];

const ALLOWED_NEXT: Record<BookingStatus, BookingStatus[]> = {
    [BookingStatus.CREATED]: [BookingStatus.ACCEPTED, BookingStatus.REJECTED, BookingStatus.CANCELLED],
    [BookingStatus.ACCEPTED]: [BookingStatus.ASSIGNING_STAFF, BookingStatus.REJECTED, BookingStatus.CANCELLED],
    [BookingStatus.ASSIGNING_STAFF]: [BookingStatus.STAFF_EN_ROUTE, BookingStatus.CANCELLED],
    [BookingStatus.STAFF_EN_ROUTE]: [BookingStatus.ARRIVED, BookingStatus.CANCELLED],
    [BookingStatus.ARRIVED]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
    [BookingStatus.REJECTED]: [],
    [BookingStatus.COMPLETED]: [],
    [BookingStatus.CANCELLED]: [],
};

function canTransition(from: BookingStatus, to: BookingStatus): boolean {
    return ALLOWED_NEXT[from]?.includes(to) ?? false;
}

const slotPublic = { is_active: true, is_deleted: false } as const;

export type PublicBooking = {
    id: string;
    user_id: string;
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
    service: { id: string; title: string };
    slot: { id: string; duration_label: string; slot_type: string };
    address: {
        id: string;
        label: string;
        line1: string;
        area: string;
        city: string;
        pincode: string;
    };
};

type BookingWithRelations = Booking & {
    service: Pick<Service, 'id' | 'title'>;
    slot: Pick<Slot, 'id' | 'duration_label' | 'slot_type'>;
    address: Pick<Address, 'id' | 'label' | 'line1' | 'area' | 'city' | 'pincode'>;
};

function mapBooking(row: BookingWithRelations): PublicBooking {
    return {
        id: row.id,
        user_id: row.user_id,
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
        service: { id: row.service.id, title: row.service.title },
        slot: {
            id: row.slot.id,
            duration_label: row.slot.duration_label,
            slot_type: row.slot.slot_type,
        },
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

const bookingInclude = {
    service: { select: { id: true, title: true } },
    slot: { select: { id: true, duration_label: true, slot_type: true } },
    address: { select: { id: true, label: true, line1: true, area: true, city: true, pincode: true } },
} as const;

class bookingService {
    list = async (userId: string) => {
        try {
            const rows = await prisma.booking.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' },
                include: bookingInclude,
            });
            return { success: true as const, data: rows.map((r) => mapBooking(r as BookingWithRelations)) };
        } catch (e) {
            console.error('[bookings] list', e);
            return { success: false as const, message: 'Could not load bookings.' };
        }
    };

    getById = async (userId: string, bookingId: string) => {
        try {
            const row = await prisma.booking.findFirst({
                where: { id: bookingId, user_id: userId },
                include: bookingInclude,
            });
            if (!row) {
                return { success: false as const, message: 'Booking not found.', code: 'NOT_FOUND' as const };
            }
            return { success: true as const, data: mapBooking(row as BookingWithRelations) };
        } catch (e) {
            console.error('[bookings] getById', e);
            return { success: false as const, message: 'Could not load booking.', code: 'SERVER' as const };
        }
    };

    create = async (
        userId: string,
        body: Record<string, unknown>,
    ): Promise<
        | { success: true; data: PublicBooking }
        | { success: false; message: string; code: 'VALIDATION' | 'NOT_FOUND' | 'SERVER' }
    > => {
        const service_id = typeof body.service_id === 'string' ? body.service_id.trim() : '';
        const slot_id = typeof body.slot_id === 'string' ? body.slot_id.trim() : '';
        const address_id = typeof body.address_id === 'string' ? body.address_id.trim() : '';
        if (!service_id || !slot_id || !address_id) {
            return {
                success: false,
                message: 'service_id, slot_id, and address_id are required.',
                code: 'VALIDATION',
            };
        }

        let payment_method: string | null = null;
        if (body.payment_method != null) {
            const pm = String(body.payment_method).trim().toUpperCase();
            if (!['UPI', 'CARD', 'WALLET'].includes(pm)) {
                return {
                    success: false,
                    message: 'payment_method must be UPI, CARD, or WALLET when provided.',
                    code: 'VALIDATION',
                };
            }
            payment_method = pm;
        }

        let scheduled_at: Date | null = null;
        if (body.scheduled_at != null && body.scheduled_at !== '') {
            const d = new Date(String(body.scheduled_at));
            if (Number.isNaN(d.getTime())) {
                return { success: false, message: 'scheduled_at must be a valid ISO date.', code: 'VALIDATION' };
            }
            scheduled_at = d;
        }

        try {
            const address = await prisma.address.findFirst({
                where: { id: address_id, user_id: userId },
            });
            if (!address) {
                return { success: false, message: 'Address not found for this user.', code: 'NOT_FOUND' };
            }

            const slot = await prisma.slot.findFirst({
                where: { id: slot_id, service_id, ...slotPublic },
                include: { service: true },
            });
            if (!slot || !slot.service || !slot.service.is_active || slot.service.is_deleted) {
                return {
                    success: false,
                    message: 'Slot not found, inactive, or does not belong to the given service.',
                    code: 'NOT_FOUND',
                };
            }

            const pf = PLATFORM_FEE_INR();
            const sc = toNum(slot.price);
            const subtotal = round2(sc + pf);
            const total = round2(subtotal);

            const created = await prisma.booking.create({
                data: {
                    user_id: userId,
                    service_id,
                    slot_id,
                    address_id,
                    status: BookingStatus.CREATED,
                    service_charge: slot.price,
                    platform_fee: pf,
                    discount_amount: 0,
                    total_amount: total,
                    payment_method,
                    scheduled_at,
                },
                include: bookingInclude,
            });

            return { success: true, data: mapBooking(created as BookingWithRelations) };
        } catch (e) {
            console.error('[bookings] create', e);
            return { success: false, message: 'Could not create booking.', code: 'SERVER' };
        }
    };

    applyCoupon = async (
        userId: string,
        bookingId: string,
        body: Record<string, unknown>,
    ): Promise<
        | { success: true; data: PublicBooking }
        | {
              success: false;
              message: string;
              code: 'VALIDATION' | 'NOT_FOUND' | 'INVALID' | 'CONFLICT' | 'SERVER';
          }
    > => {
        const codeRaw = body.code;
        if (typeof codeRaw !== 'string' || !codeRaw.trim()) {
            return { success: false, message: 'code is required.', code: 'VALIDATION' };
        }

        try {
            const booking = await prisma.booking.findFirst({
                where: { id: bookingId, user_id: userId },
                include: bookingInclude,
            });
            if (!booking) {
                return { success: false, message: 'Booking not found.', code: 'NOT_FOUND' };
            }
            if (booking.status !== BookingStatus.CREATED) {
                return {
                    success: false,
                    message: 'Coupon can only be applied while the booking is in CREATED status.',
                    code: 'INVALID',
                };
            }
            if (booking.discount_id != null) {
                return { success: false, message: 'A coupon is already applied to this booking.', code: 'CONFLICT' };
            }

            const loaded = await loadApplicableDiscountRow(codeRaw);
            if (!loaded.ok) {
                return {
                    success: false,
                    message: loaded.message,
                    code: loaded.code === 'NOT_FOUND' ? 'NOT_FOUND' : loaded.code === 'SERVER' ? 'SERVER' : 'INVALID',
                };
            }

            const sc = toNum(booking.service_charge);
            const pf = toNum(booking.platform_fee);
            const discount_amount = computeDiscountAmount(loaded.row, sc, pf);
            const total_amount = round2(Math.max(0, sc + pf - discount_amount));

            await prisma.$transaction([
                prisma.booking.update({
                    where: { id: bookingId },
                    data: {
                        discount_id: loaded.row.id,
                        applied_coupon_code: loaded.row.code,
                        discount_amount,
                        total_amount,
                    },
                }),
                prisma.discount.update({
                    where: { id: loaded.row.id },
                    data: { usage_count: { increment: 1 } },
                }),
            ]);

            const updated = await prisma.booking.findFirstOrThrow({
                where: { id: bookingId },
                include: bookingInclude,
            });
            return { success: true, data: mapBooking(updated as BookingWithRelations) };
        } catch (e) {
            console.error('[bookings] applyCoupon', e);
            return { success: false, message: 'Could not apply coupon.', code: 'SERVER' };
        }
    };

    updateStatus = async (
        userId: string,
        bookingId: string,
        body: Record<string, unknown>,
    ): Promise<
        | { success: true; data: PublicBooking }
        | { success: false; message: string; code: 'VALIDATION' | 'NOT_FOUND' | 'INVALID' | 'SERVER' }
    > => {
        const statusRaw = body.status;
        if (typeof statusRaw !== 'string' || !statusRaw.trim()) {
            return { success: false, message: 'status is required.', code: 'VALIDATION' };
        }
        const normalized = statusRaw.trim().toUpperCase().replace(/ /g, '_');
        if (normalized !== BookingStatus.CANCELLED) {
            return {
                success: false,
                message: 'You may only cancel a booking. Send status CANCELLED.',
                code: 'VALIDATION',
            };
        }
        const toStatus = BookingStatus.CANCELLED;

        try {
            const booking = await prisma.booking.findFirst({ where: { id: bookingId, user_id: userId } });
            if (!booking) {
                return { success: false, message: 'Booking not found.', code: 'NOT_FOUND' };
            }
            if (TERMINAL.includes(booking.status)) {
                return { success: false, message: 'This booking can no longer change status.', code: 'INVALID' };
            }
            if (!canTransition(booking.status, toStatus)) {
                return {
                    success: false,
                    message: `This booking cannot be cancelled from status ${booking.status}.`,
                    code: 'INVALID',
                };
            }

            await prisma.booking.update({
                where: { id: bookingId },
                data: {
                    status: toStatus,
                },
            });

            const updated = await prisma.booking.findFirstOrThrow({
                where: { id: bookingId },
                include: bookingInclude,
            });
            return { success: true, data: mapBooking(updated as BookingWithRelations) };
        } catch (e) {
            console.error('[bookings] updateStatus', e);
            return { success: false, message: 'Could not update status.', code: 'SERVER' };
        }
    };

    submitRating = async (
        userId: string,
        bookingId: string,
        body: Record<string, unknown>,
    ): Promise<
        | { success: true; data: PublicBooking }
        | { success: false; message: string; code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'INVALID' | 'SERVER' }
    > => {
        const r = body.rating;
        const rating = typeof r === 'number' ? r : Number(r);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return { success: false, message: 'rating must be an integer from 1 to 5.', code: 'VALIDATION' };
        }
        let rating_comment: string | null = null;
        if (body.comment != null) {
            if (typeof body.comment !== 'string') {
                return { success: false, message: 'comment must be a string.', code: 'VALIDATION' };
            }
            rating_comment = body.comment.trim().slice(0, 2000) || null;
        }

        try {
            const booking = await prisma.booking.findFirst({ where: { id: bookingId, user_id: userId } });
            if (!booking) {
                return { success: false, message: 'Booking not found.', code: 'NOT_FOUND' };
            }
            if (booking.status !== BookingStatus.COMPLETED) {
                return {
                    success: false,
                    message: 'You can only rate a booking after it is COMPLETED.',
                    code: 'INVALID',
                };
            }
            if (booking.rating != null) {
                return { success: false, message: 'This booking has already been rated.', code: 'CONFLICT' };
            }

            const updated = await prisma.booking.update({
                where: { id: bookingId },
                data: {
                    rating,
                    rating_comment,
                    rated_at: new Date(),
                },
                include: bookingInclude,
            });
            return { success: true, data: mapBooking(updated as BookingWithRelations) };
        } catch (e) {
            console.error('[bookings] submitRating', e);
            return { success: false, message: 'Could not save rating.', code: 'SERVER' };
        }
    };
}

export default bookingService;
