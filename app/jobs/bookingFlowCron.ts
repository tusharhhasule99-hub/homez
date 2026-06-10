import type { Prisma } from '../generated/prisma/client';
import { BookingStatus } from '../generated/prisma/enums';
import { prisma } from '../utils/prisma';

const TICK_MS = () => Number(process.env.BOOKING_FLOW_TICK_MS ?? 10_000);

/** Statuses advanced by the static booking-flow job until staff is assigned. */
const FLOW_STATUSES: BookingStatus[] = [
    BookingStatus.CREATED,
    BookingStatus.ACCEPTED,
    BookingStatus.ASSIGNING_STAFF,
];

const NEXT_STATUS: Partial<Record<BookingStatus, BookingStatus>> = {
    [BookingStatus.CREATED]: BookingStatus.ACCEPTED,
    [BookingStatus.ACCEPTED]: BookingStatus.ASSIGNING_STAFF,
    [BookingStatus.ASSIGNING_STAFF]: BookingStatus.STAFF_EN_ROUTE,
};

let staffPool: { id: string; name: string }[] | null = null;
let running = false;

async function loadStaffPool() {
    staffPool = await prisma.staff.findMany({
        where: {
            is_active: true,
            is_deleted: false,
            kyc_status: 'VERIFIED',
        },
        orderBy: { created_at: 'asc' },
        select: { id: true, name: true },
    });
    return staffPool;
}

function pickStaffName(bookingId: string, pool: { id: string; name: string }[]): string | null {
    if (pool.length === 0) return null;
    const idx =
        [...bookingId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % pool.length;
    return pool[idx]?.name ?? null;
}

async function advanceBookings() {
    if (running) return;
    running = true;

    try {
        const tickMs = TICK_MS();
        const cutoff = new Date(Date.now() - tickMs);

        const bookings = await prisma.booking.findMany({
            where: {
                status: { in: FLOW_STATUSES },
                updated_at: { lte: cutoff },
            },
            select: { id: true, status: true },
        });

        if (bookings.length === 0) return;

        if (!staffPool || staffPool.length === 0) {
            await loadStaffPool();
        }
        const pool = staffPool ?? [];

        for (const booking of bookings) {
            const nextStatus = NEXT_STATUS[booking.status];
            if (!nextStatus) continue;

            const data: Prisma.BookingUpdateInput = { status: nextStatus };

            if (nextStatus === BookingStatus.STAFF_EN_ROUTE) {
                const staffName = pickStaffName(booking.id, pool);
                if (staffName) {
                    data.staff_name = staffName;
                } else {
                    console.warn(
                        `[booking-flow] No verified staff available; booking ${booking.id} will move without staff_name.`,
                    );
                }
            }

            await prisma.booking.update({
                where: { id: booking.id },
                data,
            });

            console.log(`[booking-flow] ${booking.id}: ${booking.status} → ${nextStatus}`);
        }
    } catch (e) {
        console.error('[booking-flow] tick failed', e);
    } finally {
        running = false;
    }
}

export function startBookingFlowCron() {
    const tickMs = TICK_MS();
    void loadStaffPool();
    void advanceBookings();

    const handle = setInterval(() => {
        void advanceBookings();
    }, tickMs);

    console.log(`[booking-flow] Cron started (every ${tickMs / 1000}s until staff assigned).`);

    return () => clearInterval(handle);
}
