import 'dotenv/config';
import { prisma } from '../app/utils/prisma';

const DURATION_TIERS = [
    { label: '60 min', minutes: 60, price: 99, slash: 182 },
    { label: '90 min', minutes: 90, price: 149, slash: 274 },
    { label: '2 hrs', minutes: 120, price: 199, slash: 360 },
    { label: '2.5 hrs', minutes: 150, price: 249, slash: 447 },
    { label: '3 hrs', minutes: 180, price: 299, slash: 537 },
    { label: '3.5 hrs', minutes: 210, price: 349, slash: 623 },
] as const;

async function upsertDurationSlots(serviceId: string) {
    for (const t of DURATION_TIERS) {
        for (const slot_type of ['instant', 'scheduled'] as const) {
            await prisma.slot.upsert({
                where: {
                    service_id_slot_type_duration_minutes: {
                        service_id: serviceId,
                        slot_type,
                        duration_minutes: t.minutes,
                    },
                },
                create: {
                    service_id: serviceId,
                    slot_type,
                    duration_label: t.label,
                    duration_minutes: t.minutes,
                    price: t.price,
                    slash_price: t.slash,
                    sort_order: t.minutes,
                    is_active: true,
                    is_deleted: false,
                },
                update: {
                    duration_label: t.label,
                    price: t.price,
                    slash_price: t.slash,
                    sort_order: t.minutes,
                    is_active: true,
                    is_deleted: false,
                },
            });
        }
    }
}

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

    const serviceDefs = [
        {
            slug: 'house-cleaning',
            title: 'House Cleaning',
            description:
                'Full home sweep, mop, and surface clean — ideal for regular upkeep of living spaces.',
            image_url: 'https://placehold.co/512x512/2563eb/ffffff?text=House+Cleaning',
            sort_order: 0,
            dos: ['Sweep and mop floors', 'Dust reachable surfaces', 'Clean kitchen counters', 'Empty bins'],
            donts: ['Move heavy furniture', 'Clean exterior windows', 'Pest control'],
        },
        {
            slug: 'dusting-wiping',
            title: 'Dusting & Wiping',
            description: 'Detail dusting of shelves, furniture, and fixtures with safe cleaning agents.',
            image_url: 'https://placehold.co/512x512/2563eb/ffffff?text=Dusting',
            sort_order: 1,
            dos: ['Dust furniture and decor', 'Wipe tables and counters', 'Clean glass surfaces'],
            donts: ['Ceiling fan deep clean without ladder agreement', 'Antique restoration'],
        },
        {
            slug: 'bathroom-cleaning',
            title: 'Bathroom Cleaning',
            description: 'Sanitize sinks, taps, tiles, and fixtures for a fresh bathroom.',
            image_url: 'https://placehold.co/512x512/2563eb/ffffff?text=Bathroom',
            sort_order: 2,
            dos: ['Scrub sink and taps', 'Clean toilet exterior', 'Wipe tiles and mirrors'],
            donts: ['Unclog severe drainage', 'Repair plumbing'],
        },
        {
            slug: 'laundry-ironing',
            title: 'Laundry & Ironing',
            description: 'Wash, dry fold, and light ironing for everyday garments.',
            image_url: 'https://placehold.co/512x512/2563eb/ffffff?text=Laundry',
            sort_order: 3,
            dos: ['Machine wash as per labels', 'Fold and stack', 'Basic ironing'],
            donts: ['Dry clean only items', 'Silk or leather specialty care'],
        },
        {
            slug: 'cleaning-dishes',
            title: 'Cleaning Dishes',
            description: 'Kitchen sink dishes washed, dried, and organized.',
            image_url: 'https://placehold.co/512x512/2563eb/ffffff?text=Dishes',
            sort_order: 4,
            dos: ['Wash dishes and utensils', 'Wipe sink area', 'Load/unload dishwasher if available'],
            donts: ['Crystal or hand-painted china without instruction'],
        },
        {
            slug: 'more-services',
            title: 'And many more',
            description: 'Deep clean, fridge, balcony, and add-ons — ask in app for custom scope.',
            image_url: 'https://placehold.co/512x512/2563eb/ffffff?text=More',
            sort_order: 5,
            dos: ['Custom scope on request', 'Add-on deep tasks'],
            donts: ['Hazardous material handling'],
        },
    ] as const;

    for (const s of serviceDefs) {
        const row = await prisma.service.upsert({
            where: { slug: s.slug },
            create: {
                slug: s.slug,
                title: s.title,
                description: s.description,
                image_url: s.image_url,
                dos: [...s.dos],
                donts: [...s.donts],
                sort_order: s.sort_order,
                is_active: true,
                is_deleted: false,
            },
            update: {
                title: s.title,
                description: s.description,
                image_url: s.image_url,
                dos: [...s.dos],
                donts: [...s.donts],
                sort_order: s.sort_order,
                is_active: true,
                is_deleted: false,
            },
        });
        await upsertDurationSlots(row.id);
    }

    console.log('Seed: discounts + services/slots (Snabbit-style tiers: instant + scheduled).');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
