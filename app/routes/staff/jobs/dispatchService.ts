/**
 * Real-time job dispatch: when a booking is created, offer it to every active
 * KYC-verified staff member over SSE; the first to accept wins (atomic claim).
 * Offers are persisted in `job_offers` for audit + first-come-first-serve.
 */

import type { Prisma } from '../../../generated/prisma/client';
import { BookingStatus, JobOfferStatus } from '../../../generated/prisma/enums';
import { prisma } from '../../../utils/prisma';
import { sendToStaff, sendToUser } from '../../../realtime/sseRegistry';

// ---- Config (read env lazily, matching the rest of the codebase) ----

const OFFER_WINDOW_SEC = () => Number(process.env.DISPATCH_OFFER_WINDOW_SEC ?? 60);
// ---- Types ----

interface OfferPayload {
    offerId: string;
    bookingId: string;
    service: string;
    area: string;
    city: string;
    distanceKm: number;
    amount: number;
    expiresAt: string;
}

// ---- Candidate search ----

async function findEligibleStaff(): Promise<{ id: string; name: string; distanceKm: number }[]> {
    const candidates = await prisma.staff.findMany({
        where: {
            is_active: true,
            is_deleted: false,
            kyc_status: 'VERIFIED',
        },
        select: { id: true, name: true },
    });

    // Demo mode: radius, coordinates, availability and last-seen checks are
    // intentionally disabled. Restore those filters before location-based launch.
    return candidates.map((staff) => ({ ...staff, distanceKm: 0 }));
}

// ---- Offer emission ----

/**
 * Offer a booking (already in AWAITING_STAFF) to every KYC-verified staff member.
 * Upserts a PENDING JobOffer per staff (skipping any who already have a live
 * offer for this booking) and pushes `job.offered` over SSE. Returns the count
 * of newly offered staff.
 */
async function offerToStaff(
    booking: {
        id: string;
        service: { title: string };
        address: { area: string; city: string; latitude: number; longitude: number };
        total_amount: Prisma.Decimal;
    },
    radiusKm: number,
): Promise<number> {
    const eligible = await findEligibleStaff();
    if (eligible.length === 0) return 0;

    // Staff who already have a non-expired/-declined offer for this booking are skipped.
    const existing = await prisma.jobOffer.findMany({
        where: {
            booking_id: booking.id,
            staff_id: { in: eligible.map((s) => s.id) },
            status: { in: [JobOfferStatus.PENDING, JobOfferStatus.ACCEPTED] },
        },
        select: { staff_id: true },
    });
    const skip = new Set(existing.map((o) => o.staff_id));
    const targets = eligible.filter((s) => !skip.has(s.id));
    if (targets.length === 0) return 0;

    const expiresAt = new Date(Date.now() + OFFER_WINDOW_SEC() * 1000);
    const amount = Number(booking.total_amount);

    for (const staff of targets) {
        // upsert covers the case where a prior EXPIRED/DECLINED offer exists
        // for this (booking, staff) pair — the @@unique constraint requires it.
        const offer = await prisma.jobOffer.upsert({
            where: { booking_id_staff_id: { booking_id: booking.id, staff_id: staff.id } },
            create: {
                booking_id: booking.id,
                staff_id: staff.id,
                status: JobOfferStatus.PENDING,
                radius_km: radiusKm,
                expires_at: expiresAt,
            },
            update: {
                status: JobOfferStatus.PENDING,
                radius_km: radiusKm,
                offered_at: new Date(),
                responded_at: null,
                expires_at: expiresAt,
            },
            select: { id: true },
        });

        const payload: OfferPayload = {
            offerId: offer.id,
            bookingId: booking.id,
            service: booking.service.title,
            area: booking.address.area,
            city: booking.address.city,
            distanceKm: Math.round(staff.distanceKm * 1000) / 1000,
            amount,
            expiresAt: expiresAt.toISOString(),
        };
        sendToStaff(staff.id, 'job.offered', payload);
    }

    return targets.length;
}

const bookingForDispatch = {
    id: true,
    status: true,
    total_amount: true,
    service: { select: { title: true } },
    address: { select: { area: true, city: true, latitude: true, longitude: true } },
} satisfies Prisma.BookingSelect;

// ---- Public API ----

/**
 * Kick off dispatch for a freshly-created booking. Transitions it to
 * AWAITING_STAFF and offers it to every active KYC-verified staff member.
 * Fire-and-forget from the booking controller; safe to call more than once
 * (the sweep also self-heals stuck CREATED bookings).
 */
export async function dispatchBooking(bookingId: string): Promise<void> {
    const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: bookingForDispatch,
    });
    if (!booking) return;
    if (booking.status !== BookingStatus.CREATED && booking.status !== BookingStatus.AWAITING_STAFF) {
        return; // already progressed past dispatch
    }

    const radiusKm = 0; // Demo mode: radius filtering is disabled.

    await prisma.booking.update({
        where: { id: bookingId },
        data: {
            status: BookingStatus.AWAITING_STAFF,
            dispatch_started_at: new Date(),
            current_radius_km: radiusKm,
            last_offer_batch_at: new Date(),
        },
    });

    await offerToStaff(booking, radiusKm);
}

/**
 * First staff to accept wins. Uses a conditional updateMany on the booking as
 * an atomic compare-and-set: only the request that flips staff_id/status from
 * (null, AWAITING_STAFF) succeeds; all others get ALREADY_TAKEN.
 */
export async function acceptOffer(
    staffId: string,
    offerId: string,
): Promise<
    | { success: true; data: { bookingId: string } }
    | { success: false; message: string; code: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_TAKEN' | 'SERVER' }
> {
    try {
        const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { name: true } });
        if (!staff) {
            return { success: false, message: 'Staff not found.', code: 'NOT_FOUND' };
        }

        const result = await prisma.$transaction(async (tx) => {
            const offer = await tx.jobOffer.findUnique({
                where: { id: offerId },
                include: { booking: { select: { user_id: true } } },
            });
            if (!offer || offer.staff_id !== staffId) {
                return { code: 'NOT_FOUND' as const };
            }
            if (offer.status !== JobOfferStatus.PENDING || offer.expires_at < new Date()) {
                return { code: 'EXPIRED' as const };
            }

            const claim = await tx.booking.updateMany({
                where: { id: offer.booking_id, staff_id: null, status: BookingStatus.AWAITING_STAFF },
                data: { staff_id: staffId, staff_name: staff.name, status: BookingStatus.ACCEPTED },
            });
            if (claim.count === 0) {
                return { code: 'ALREADY_TAKEN' as const };
            }

            // Winner's offer -> ACCEPTED; collect + expire everyone else's PENDING offer.
            await tx.jobOffer.update({
                where: { id: offerId },
                data: { status: JobOfferStatus.ACCEPTED, responded_at: new Date() },
            });
            const losers = await tx.jobOffer.findMany({
                where: {
                    booking_id: offer.booking_id,
                    id: { not: offerId },
                    status: JobOfferStatus.PENDING,
                },
                select: { staff_id: true },
            });
            await tx.jobOffer.updateMany({
                where: {
                    booking_id: offer.booking_id,
                    id: { not: offerId },
                    status: JobOfferStatus.PENDING,
                },
                data: { status: JobOfferStatus.EXPIRED, responded_at: new Date() },
            });

            return {
                code: 'OK' as const,
                bookingId: offer.booking_id,
                userId: offer.booking.user_id,
                loserIds: losers.map((l) => l.staff_id),
            };
        });

        if (result.code !== 'OK') {
            const messages: Record<string, string> = {
                NOT_FOUND: 'Offer not found.',
                EXPIRED: 'This job offer has expired.',
                ALREADY_TAKEN: 'This job has already been taken by another staff.',
            };
            return { success: false, message: messages[result.code], code: result.code };
        }

        // Notify winner + losers over SSE (outside the transaction).
        sendToStaff(staffId, 'job.assigned', { bookingId: result.bookingId });
        for (const loserId of result.loserIds) {
            sendToStaff(loserId, 'job.expired', { bookingId: result.bookingId });
        }

        // Notify the booking owner that staff was assigned.
        sendToUser(result.userId, 'booking.staff_assigned', {
            bookingId: result.bookingId,
            status: BookingStatus.ACCEPTED,
            staffId,
            staffName: staff.name,
            assignedAt: new Date().toISOString(),
        });

        return { success: true, data: { bookingId: result.bookingId } };
    } catch (e) {
        console.error('[dispatch] acceptOffer', e);
        return { success: false, message: 'Could not accept the job.', code: 'SERVER' };
    }
}

/** Decline an offer. Does not reassign — the sweep continues searching. */
export async function declineOffer(
    staffId: string,
    offerId: string,
): Promise<
    | { success: true }
    | { success: false; message: string; code: 'NOT_FOUND' | 'SERVER' }
> {
    try {
        const updated = await prisma.jobOffer.updateMany({
            where: { id: offerId, staff_id: staffId, status: JobOfferStatus.PENDING },
            data: { status: JobOfferStatus.DECLINED, responded_at: new Date() },
        });
        if (updated.count === 0) {
            return { success: false, message: 'Offer not found or no longer pending.', code: 'NOT_FOUND' };
        }
        return { success: true };
    } catch (e) {
        console.error('[dispatch] declineOffer', e);
        return { success: false, message: 'Could not decline the job.', code: 'SERVER' };
    }
}

/** List a staff member's live (PENDING, not-yet-expired) offers. */
export async function listOffers(staffId: string) {
    return prisma.jobOffer.findMany({
        where: { staff_id: staffId, status: JobOfferStatus.PENDING, expires_at: { gt: new Date() } },
        orderBy: { offered_at: 'desc' },
        select: {
            id: true,
            radius_km: true,
            offered_at: true,
            expires_at: true,
            booking: {
                select: {
                    id: true,
                    total_amount: true,
                    service: { select: { title: true } },
                    address: { select: { area: true, city: true } },
                },
            },
        },
    });
}

/**
 * Expire all of a staff member's PENDING offers (used when they go offline).
 * Pushes `job.expired` for each so their app clears the alert.
 */
export async function expireStaffOffers(staffId: string): Promise<void> {
    const pending = await prisma.jobOffer.findMany({
        where: { staff_id: staffId, status: JobOfferStatus.PENDING },
        select: { id: true, booking_id: true },
    });
    if (pending.length === 0) return;

    await prisma.jobOffer.updateMany({
        where: { staff_id: staffId, status: JobOfferStatus.PENDING },
        data: { status: JobOfferStatus.EXPIRED, responded_at: new Date() },
    });
    for (const offer of pending) {
        sendToStaff(staffId, 'job.expired', { bookingId: offer.booking_id });
    }
}

/**
 * Expire all PENDING offers for a booking (used when the user cancels).
 * Pushes `job.expired` to each affected staff.
 */
export async function expireBookingOffers(bookingId: string): Promise<void> {
    const pending = await prisma.jobOffer.findMany({
        where: { booking_id: bookingId, status: JobOfferStatus.PENDING },
        select: { staff_id: true },
    });
    if (pending.length === 0) return;

    await prisma.jobOffer.updateMany({
        where: { booking_id: bookingId, status: JobOfferStatus.PENDING },
        data: { status: JobOfferStatus.EXPIRED, responded_at: new Date() },
    });
    for (const offer of pending) {
        sendToStaff(offer.staff_id, 'job.expired', { bookingId });
    }
}

/**
 * One sweep tick, invoked on an interval by the dispatch cron:
 *  1. Expire timed-out PENDING offers.
 *  2. Self-heal: dispatch any CREATED booking that never got its trigger.
 *  3. Re-offer AWAITING_STAFF bookings to all verified staff after each window.
 */
export async function runSweep(): Promise<void> {
    const now = new Date();

    // 1. Expire timed-out offers and notify.
    const stale = await prisma.jobOffer.findMany({
        where: { status: JobOfferStatus.PENDING, expires_at: { lt: now } },
        select: { staff_id: true, booking_id: true },
    });
    if (stale.length > 0) {
        await prisma.jobOffer.updateMany({
            where: { status: JobOfferStatus.PENDING, expires_at: { lt: now } },
            data: { status: JobOfferStatus.EXPIRED },
        });
        for (const offer of stale) {
            sendToStaff(offer.staff_id, 'job.expired', { bookingId: offer.booking_id });
        }
    }

    // 2. Self-heal CREATED bookings whose fire-and-forget trigger failed.
    const orphaned = await prisma.booking.findMany({
        where: { status: BookingStatus.CREATED, created_at: { lt: new Date(now.getTime() - 3000) } },
        select: { id: true },
        take: 25,
    });
    for (const b of orphaned) {
        await dispatchBooking(b.id).catch((e) => console.error('[dispatch] self-heal', e));
    }

    // 3. Re-offer to all verified staff for bookings still searching.
    const windowMs = OFFER_WINDOW_SEC() * 1000;
    const searching = await prisma.booking.findMany({
        where: { status: BookingStatus.AWAITING_STAFF },
        select: { ...bookingForDispatch, current_radius_km: true, last_offer_batch_at: true },
        take: 50,
    });
    for (const booking of searching) {
        const lastBatch = booking.last_offer_batch_at?.getTime() ?? 0;
        if (now.getTime() - lastBatch < windowMs) continue; // window not elapsed yet

        const radiusKm = 0; // Demo mode: no area/radius validation.

        await prisma.booking.update({
            where: { id: booking.id },
            data: { current_radius_km: radiusKm, last_offer_batch_at: now },
        });
        await offerToStaff(booking, radiusKm).catch((e) => console.error('[dispatch] re-offer', e));
    }
}
