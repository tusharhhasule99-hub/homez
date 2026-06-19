import crypto from 'crypto';
import type { Payment } from '../../generated/prisma/client';
import { BookingStatus, PaymentStatus } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../utils/prisma';
import {
    createRazorpayOrder,
    createRazorpayPaymentLink,
    fetchRazorpayPaymentLink,
    fetchRazorpayPaymentsForOrder,
    getRazorpayKey,
    rupeesToPaise,
} from '../../services/razorpay';

const TERMINAL_BOOKING: BookingStatus[] = [
    BookingStatus.CANCELLED,
    BookingStatus.REJECTED,
    BookingStatus.COMPLETED,
];

const OPEN_PAYMENT: PaymentStatus[] = [PaymentStatus.CREATED, PaymentStatus.PENDING];

function toNum(d: Prisma.Decimal | number): number {
    return typeof d === 'number' ? d : Number(d);
}

function mapPaymentMethod(method: string | null | undefined): string | null {
    if (!method) return null;
    const m = method.toLowerCase();
    if (m.includes('upi')) return 'UPI';
    if (m.includes('card')) return 'CARD';
    if (m.includes('wallet')) return 'WALLET';
    return method.toUpperCase();
}

export type PublicPayment = {
    id: string;
    booking_id: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    payment_url: string | null;
    razorpay_order_id: string | null;
    razorpay_payment_id: string | null;
    razorpay_payment_link_id: string | null;
    method: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
    checkout: {
        key: string;
        order_id: string;
        amount: number;
        currency: string;
        name: string;
        description: string;
    } | null;
};

function mapPayment(row: Payment, checkout: PublicPayment['checkout']): PublicPayment {
    return {
        id: row.id,
        booking_id: row.booking_id,
        status: row.status,
        amount: toNum(row.amount),
        currency: row.currency,
        payment_url: row.payment_url,
        razorpay_order_id: row.razorpay_order_id,
        razorpay_payment_id: row.razorpay_payment_id,
        razorpay_payment_link_id: row.razorpay_payment_link_id,
        method: row.method,
        paid_at: row.paid_at?.toISOString() ?? null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        checkout,
    };
}

function buildCheckout(row: Payment): PublicPayment['checkout'] {
    if (!row.razorpay_order_id) return null;
    return {
        key: getRazorpayKey(),
        order_id: row.razorpay_order_id,
        amount: rupeesToPaise(toNum(row.amount)),
        currency: row.currency,
        name: 'HomeZ',
        description: `Booking ${row.booking_id}`,
    };
}

async function syncPaymentFromRazorpay(row: Payment): Promise<Payment> {
    if (row.status === PaymentStatus.PAID || row.status === PaymentStatus.FAILED) {
        return row;
    }

    if (row.razorpay_payment_link_id) {
        const link = await fetchRazorpayPaymentLink(row.razorpay_payment_link_id);
        if (link.status === 'paid') {
            return markPaymentPaid(row.id, row.booking_id, {
                razorpay_payment_id: row.razorpay_payment_id,
                method: row.method,
            });
        }
        if (link.status === 'expired' || link.status === 'cancelled') {
            return prisma.payment.update({
                where: { id: row.id },
                data: {
                    status: link.status === 'expired' ? PaymentStatus.EXPIRED : PaymentStatus.FAILED,
                    failure_reason: `Payment link ${link.status}`,
                },
            });
        }
        if (link.status === 'created' || link.status === 'partially_paid') {
            return prisma.payment.update({
                where: { id: row.id },
                data: { status: PaymentStatus.PENDING },
            });
        }
    }

    if (row.razorpay_order_id) {
        const payments = await fetchRazorpayPaymentsForOrder(row.razorpay_order_id);
        const captured = payments.find((p) => p.status === 'captured');
        if (captured) {
            return markPaymentPaid(row.id, row.booking_id, {
                razorpay_payment_id: captured.id,
                method: mapPaymentMethod(captured.method),
            });
        }
        const failed = payments.find((p) => p.status === 'failed');
        if (failed) {
            return prisma.payment.update({
                where: { id: row.id },
                data: {
                    status: PaymentStatus.FAILED,
                    failure_reason: 'Payment failed at Razorpay',
                },
            });
        }
        return prisma.payment.update({
            where: { id: row.id },
            data: { status: PaymentStatus.PENDING },
        });
    }

    return row;
}

export async function markPaymentPaid(
    paymentId: string,
    bookingId: string,
    opts: { razorpay_payment_id?: string | null; method?: string | null },
): Promise<Payment> {
    const paidAt = new Date();
    const method = mapPaymentMethod(opts.method ?? null);

    const [payment] = await prisma.$transaction([
        prisma.payment.update({
            where: { id: paymentId },
            data: {
                status: PaymentStatus.PAID,
                razorpay_payment_id: opts.razorpay_payment_id ?? undefined,
                method: method ?? undefined,
                paid_at: paidAt,
                failure_reason: null,
            },
        }),
        prisma.booking.update({
            where: { id: bookingId },
            data: {
                payment_method: method ?? undefined,
            },
        }),
    ]);

    return payment;
}

class paymentService {
    createForBooking = async (
        userId: string,
        bookingId: string,
    ): Promise<
        | { success: true; data: PublicPayment }
        | { success: false; message: string; code: 'NOT_FOUND' | 'INVALID' | 'CONFLICT' | 'SERVER' }
    > => {
        try {
            const booking = await prisma.booking.findFirst({
                where: { id: bookingId, user_id: userId },
                include: { user: { select: { phone_number: true, name: true } } },
            });
            if (!booking) {
                return { success: false, message: 'Booking not found.', code: 'NOT_FOUND' };
            }
            if (TERMINAL_BOOKING.includes(booking.status)) {
                return {
                    success: false,
                    message: 'Payment cannot be started for this booking status.',
                    code: 'INVALID',
                };
            }

            const existing = await prisma.payment.findUnique({ where: { booking_id: bookingId } });
            if (existing) {
                if (existing.status === PaymentStatus.PAID) {
                    return {
                        success: false,
                        message: 'This booking is already paid.',
                        code: 'CONFLICT',
                    };
                }
                if (OPEN_PAYMENT.includes(existing.status) && existing.payment_url && existing.razorpay_order_id) {
                    return { success: true, data: mapPayment(existing, buildCheckout(existing)) };
                }
            }

            // booking.total_amount is in rupees (from slot price); Razorpay orders expect paise
            const amountPaise = rupeesToPaise(toNum(booking.total_amount));

            const paymentId = existing?.id ?? crypto.randomUUID();
            const receipt = `booking_${bookingId.slice(0, 8)}_${Date.now()}`;
            const notes = {
                booking_id: bookingId,
                payment_id: paymentId,
                user_id: userId,
            };

            const order = await createRazorpayOrder({
                amountPaise,
                receipt,
                notes,
            });

            const callbackUrl = `https://api.homzy.online/api/payments/callback`;

            const paymentLink = await createRazorpayPaymentLink({
                amountPaise,
                referenceId: bookingId,
                description: `HomeZ booking payment`,
                notes,
                callbackUrl,
            });

            const row = await prisma.payment.upsert({
                where: { booking_id: bookingId },
                create: {
                    id: paymentId,
                    booking_id: bookingId,
                    amount: booking.total_amount,
                    currency: 'INR',
                    status: PaymentStatus.PENDING,
                    razorpay_order_id: order.id,
                    razorpay_payment_link_id: paymentLink.id,
                    payment_url: paymentLink.short_url,
                },
                update: {
                    amount: booking.total_amount,
                    status: PaymentStatus.PENDING,
                    razorpay_order_id: order.id,
                    razorpay_payment_link_id: paymentLink.id,
                    payment_url: paymentLink.short_url,
                    razorpay_payment_id: null,
                    method: null,
                    paid_at: null,
                    failure_reason: null,
                },
            });

            return { success: true, data: mapPayment(row, buildCheckout(row)) };
        } catch (e) {
            console.error('[payments] createForBooking', e);
            return { success: false, message: 'Could not create payment.', code: 'SERVER' };
        }
    };

    getStatusForBooking = async (
        userId: string,
        bookingId: string,
    ): Promise<
        | { success: true; data: PublicPayment }
        | { success: false; message: string; code: 'NOT_FOUND' | 'SERVER' }
    > => {
        try {
            const booking = await prisma.booking.findFirst({
                where: { id: bookingId, user_id: userId },
                select: { id: true },
            });
            if (!booking) {
                return { success: false, message: 'Booking not found.', code: 'NOT_FOUND' };
            }

            let payment = await prisma.payment.findUnique({ where: { booking_id: bookingId } });
            if (!payment) {
                return { success: false, message: 'No payment found for this booking.', code: 'NOT_FOUND' };
            }

            payment = await syncPaymentFromRazorpay(payment);
            return { success: true, data: mapPayment(payment, buildCheckout(payment)) };
        } catch (e) {
            console.error('[payments] getStatusForBooking', e);
            return { success: false, message: 'Could not fetch payment status.', code: 'SERVER' };
        }
    };

    handleWebhookEvent = async (event: string, payload: Record<string, unknown>): Promise<void> => {
        if (event === 'payment.captured') {
            const entity = (payload.payment as { entity?: Record<string, unknown> } | undefined)?.entity;
            if (!entity) return;
            await this.applyCapturedPayment(entity);
            return;
        }

        if (event === 'payment.failed') {
            const entity = (payload.payment as { entity?: Record<string, unknown> } | undefined)?.entity;
            if (!entity) return;
            await this.applyFailedPayment(entity);
            return;
        }

        if (event === 'payment_link.paid') {
            const entity = (payload.payment_link as { entity?: Record<string, unknown> } | undefined)?.entity;
            const paymentEntity = (payload.payment as { entity?: Record<string, unknown> } | undefined)?.entity;
            if (entity) {
                await this.applyPaymentLinkPaid(entity, paymentEntity);
            }
        }
    };

    private applyCapturedPayment = async (entity: Record<string, unknown>) => {
        const orderId = typeof entity.order_id === 'string' ? entity.order_id : null;
        const paymentId = typeof entity.id === 'string' ? entity.id : null;
        const method = typeof entity.method === 'string' ? entity.method : null;
        if (!orderId) return;

        const row = await prisma.payment.findFirst({ where: { razorpay_order_id: orderId } });
        if (!row || row.status === PaymentStatus.PAID) return;

        await markPaymentPaid(row.id, row.booking_id, {
            razorpay_payment_id: paymentId,
            method,
        });
    };

    private applyFailedPayment = async (entity: Record<string, unknown>) => {
        const orderId = typeof entity.order_id === 'string' ? entity.order_id : null;
        if (!orderId) return;

        const row = await prisma.payment.findFirst({ where: { razorpay_order_id: orderId } });
        if (!row || row.status === PaymentStatus.PAID) return;

        const reason =
            typeof entity.error_description === 'string'
                ? entity.error_description
                : 'Payment failed at Razorpay';

        await prisma.payment.update({
            where: { id: row.id },
            data: {
                status: PaymentStatus.FAILED,
                failure_reason: reason,
                razorpay_payment_id: typeof entity.id === 'string' ? entity.id : undefined,
            },
        });
    };

    private applyPaymentLinkPaid = async (
        linkEntity: Record<string, unknown>,
        paymentEntity?: Record<string, unknown>,
    ) => {
        const linkId = typeof linkEntity.id === 'string' ? linkEntity.id : null;
        if (!linkId) return;

        const row = await prisma.payment.findFirst({ where: { razorpay_payment_link_id: linkId } });
        if (!row || row.status === PaymentStatus.PAID) return;

        const notes = linkEntity.notes as Record<string, string> | undefined;
        const bookingId = notes?.booking_id ?? row.booking_id;

        await markPaymentPaid(row.id, bookingId, {
            razorpay_payment_id:
                typeof paymentEntity?.id === 'string'
                    ? paymentEntity.id
                    : typeof row.razorpay_payment_id === 'string'
                      ? row.razorpay_payment_id
                      : null,
            method: typeof paymentEntity?.method === 'string' ? paymentEntity.method : null,
        });
    };
}

export default paymentService;
