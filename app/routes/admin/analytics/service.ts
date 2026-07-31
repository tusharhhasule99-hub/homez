import { BookingStatus } from '../../../generated/prisma/enums';
import { prisma } from '../../../utils/prisma';

function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return startOfDay(d);
}

function toNum(v: unknown): number {
    if (typeof v === 'number') return v;
    return Number(v) || 0;
}

class adminAnalyticsService {
    overview = async () => {
        try {
            const since14 = daysAgo(13);
            const since30 = daysAgo(29);

            const [
                usersTotal,
                usersActive,
                staffTotal,
                staffPendingKyc,
                servicesActive,
                addressesTotal,
                bookingsTotal,
                bookingsOpen,
                bookingsCompleted,
                revenueAgg,
                revenue30Agg,
                statusGroups,
                recentBookings,
                topServicesRaw,
            ] = await Promise.all([
                prisma.users.count({ where: { is_deleted: false } }),
                prisma.users.count({ where: { is_deleted: false, is_active: true } }),
                prisma.staff.count({ where: { is_deleted: false } }),
                prisma.staff.count({ where: { is_deleted: false, kyc_status: 'PENDING' } }),
                prisma.service.count({ where: { is_deleted: false, is_active: true } }),
                prisma.address.count(),
                prisma.booking.count(),
                prisma.booking.count({
                    where: {
                        status: {
                            in: [
                                BookingStatus.CREATED,
                                BookingStatus.AWAITING_STAFF,
                                BookingStatus.ACCEPTED,
                                BookingStatus.ASSIGNING_STAFF,
                                BookingStatus.STAFF_EN_ROUTE,
                                BookingStatus.ARRIVED,
                            ],
                        },
                    },
                }),
                prisma.booking.count({ where: { status: BookingStatus.COMPLETED } }),
                prisma.booking.aggregate({
                    where: { status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REJECTED] } },
                    _sum: { total_amount: true },
                }),
                prisma.booking.aggregate({
                    where: {
                        created_at: { gte: since30 },
                        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REJECTED] },
                    },
                    _sum: { total_amount: true },
                }),
                prisma.booking.groupBy({
                    by: ['status'],
                    _count: { _all: true },
                }),
                prisma.booking.findMany({
                    where: { created_at: { gte: since14 } },
                    select: { created_at: true, total_amount: true, status: true },
                }),
                prisma.booking.groupBy({
                    by: ['service_id'],
                    _count: { _all: true },
                    _sum: { total_amount: true },
                    orderBy: { _count: { service_id: 'desc' } },
                    take: 5,
                }),
            ]);

            const serviceIds = topServicesRaw.map((r: { service_id: string }) => r.service_id);
            const serviceRows = serviceIds.length
                ? await prisma.service.findMany({
                      where: { id: { in: serviceIds } },
                      select: { id: true, title: true },
                  })
                : [];
            const titleById = new Map(serviceRows.map((s: { id: string; title: string }) => [s.id, s.title]));

            const byStatus: Record<string, number> = {};
            for (const g of statusGroups) {
                byStatus[g.status] = g._count._all;
            }

            const dayKeys: string[] = [];
            for (let i = 13; i >= 0; i--) {
                const d = daysAgo(i);
                dayKeys.push(d.toISOString().slice(0, 10));
            }
            const bookingsByDay = dayKeys.map((date) => ({ date, count: 0, revenue: 0 }));
            const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));
            for (const b of recentBookings) {
                const key = startOfDay(b.created_at).toISOString().slice(0, 10);
                const idx = dayIndex.get(key);
                if (idx == null) continue;
                bookingsByDay[idx].count += 1;
                if (b.status !== BookingStatus.CANCELLED && b.status !== BookingStatus.REJECTED) {
                    bookingsByDay[idx].revenue += toNum(b.total_amount);
                }
            }

            return {
                success: true as const,
                message: 'OK',
                data: {
                    totals: {
                        users: usersTotal,
                        users_active: usersActive,
                        staff: staffTotal,
                        staff_pending_kyc: staffPendingKyc,
                        services_active: servicesActive,
                        addresses: addressesTotal,
                        bookings: bookingsTotal,
                        bookings_open: bookingsOpen,
                        bookings_completed: bookingsCompleted,
                        revenue_total: toNum(revenueAgg._sum.total_amount),
                        revenue_last_30_days: toNum(revenue30Agg._sum.total_amount),
                    },
                    bookings_by_status: byStatus,
                    bookings_last_14_days: bookingsByDay,
                    top_services: topServicesRaw.map(
                        (r: {
                            service_id: string;
                            _count: { _all: number };
                            _sum: { total_amount: unknown };
                        }) => ({
                            service_id: r.service_id,
                            title: titleById.get(r.service_id) ?? 'Unknown',
                            bookings: r._count._all,
                            revenue: toNum(r._sum.total_amount),
                        }),
                    ),
                    generated_at: new Date().toISOString(),
                },
            };
        } catch (e) {
            console.error('[admin analytics] overview', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminAnalyticsService;
