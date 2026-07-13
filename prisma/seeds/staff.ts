import { prisma } from '../../app/utils/prisma';

// Coordinates are seeded around a Bengaluru test center (12.9716, 77.5946):
// the first three are within ~1km (dispatched immediately), #4 is ~3km away
// (reached after one radius widen), #5 is ~10km away (widen test / never in 5km).
const STAFF_ROWS = [
    {
        phone_number: '9876500001',
        name: 'Priya Sharma',
        gender: 'female',
        role_title: 'Home Cleaning Pro',
        latitude: 12.9743,
        longitude: 77.5946,
    },
    {
        phone_number: '9876500002',
        name: 'Raj Kumar',
        gender: 'male',
        role_title: 'Deep Clean Specialist',
        latitude: 12.9716,
        longitude: 77.5964,
    },
    {
        phone_number: '9876500003',
        name: 'Anita Desai',
        gender: 'female',
        role_title: 'Bathroom & Kitchen Expert',
        latitude: 12.9703,
        longitude: 77.5952,
    },
    {
        phone_number: '9876500004',
        name: 'Vikram Singh',
        gender: 'male',
        role_title: 'Multi-service Pro',
        latitude: 12.9986,
        longitude: 77.5946,
    },
    {
        phone_number: '9876500005',
        name: 'Meera Patel',
        gender: 'female',
        role_title: 'Scheduled Booking Specialist',
        latitude: 13.0616,
        longitude: 77.5946,
    },
] as const;

export async function seedStaff() {
    for (const row of STAFF_ROWS) {
        await prisma.staff.upsert({
            where: { phone_number: row.phone_number },
            create: {
                phone_number: row.phone_number,
                name: row.name,
                gender: row.gender,
                role_title: row.role_title,
                is_active: true,
                is_deleted: false,
                is_phone_verified: true,
                is_photo_verified: true,
                is_docs_verified: true,
                kyc_status: 'VERIFIED',
                latitude: row.latitude,
                longitude: row.longitude,
                is_available: true,
                last_seen_at: new Date(),
            },
            update: {
                name: row.name,
                gender: row.gender,
                role_title: row.role_title,
                is_active: true,
                is_deleted: false,
                is_phone_verified: true,
                is_photo_verified: true,
                is_docs_verified: true,
                kyc_status: 'VERIFIED',
                latitude: row.latitude,
                longitude: row.longitude,
                is_available: true,
                last_seen_at: new Date(),
            },
        });
    }

    console.log(`Seed: ${STAFF_ROWS.length} staff members ready (verified, assignable).`);
}
