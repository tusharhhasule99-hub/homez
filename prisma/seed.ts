import 'dotenv/config';
import { prisma } from '../app/utils/prisma';

async function main() {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    await prisma.discount.upsert({
        where: { code: 'FIRST50' },
        create: {
            title: '50% OFF on First Booking',
            code: 'FIRST50',
            percentage: 50,
            amount: null,
            expires_at: expiresAt,
            usage_limit_total: 100,
            usage_count: 0,
            limit_label: 'First 100 bookings',
            is_active: true,
            is_deleted: false,
        },
        update: {
            title: '50% OFF on First Booking',
            percentage: 50,
            amount: null,
            expires_at: expiresAt,
            usage_limit_total: 100,
            limit_label: 'First 100 bookings',
            is_active: true,
            is_deleted: false,
        },
    });

    await prisma.discount.upsert({
        where: { code: 'SAVE200' },
        create: {
            title: '₹200 off your next clean',
            code: 'SAVE200',
            percentage: null,
            amount: 200,
            expires_at: expiresAt,
            usage_limit_total: null,
            usage_count: 0,
            limit_label: null,
            is_active: true,
            is_deleted: false,
        },
        update: {
            title: '₹200 off your next clean',
            percentage: null,
            amount: 200,
            expires_at: expiresAt,
            usage_limit_total: null,
            limit_label: null,
            is_active: true,
            is_deleted: false,
        },
    });

    await prisma.discount.upsert({
        where: { code: 'COMBO25' },
        create: {
            title: '25% + ₹50 off',
            code: 'COMBO25',
            percentage: 25,
            amount: 50,
            expires_at: expiresAt,
            usage_limit_total: 500,
            usage_count: 0,
            limit_label: 'First 500 redemptions',
            is_active: true,
            is_deleted: false,
        },
        update: {
            title: '25% + ₹50 off',
            percentage: 25,
            amount: 50,
            expires_at: expiresAt,
            usage_limit_total: 500,
            limit_label: 'First 500 redemptions',
            is_active: true,
            is_deleted: false,
        },
    });

    console.log('Seed: discounts upserted (FIRST50, SAVE200, COMBO25).');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
