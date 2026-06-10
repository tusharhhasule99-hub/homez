import { prisma } from '../../app/utils/prisma';

const STAFF_ROWS = [
    {
        phone_number: '9876500001',
        name: 'Priya Sharma',
        gender: 'female',
        role_title: 'Home Cleaning Pro',
    },
    {
        phone_number: '9876500002',
        name: 'Raj Kumar',
        gender: 'male',
        role_title: 'Deep Clean Specialist',
    },
    {
        phone_number: '9876500003',
        name: 'Anita Desai',
        gender: 'female',
        role_title: 'Bathroom & Kitchen Expert',
    },
    {
        phone_number: '9876500004',
        name: 'Vikram Singh',
        gender: 'male',
        role_title: 'Multi-service Pro',
    },
    {
        phone_number: '9876500005',
        name: 'Meera Patel',
        gender: 'female',
        role_title: 'Scheduled Booking Specialist',
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
            },
        });
    }

    console.log(`Seed: ${STAFF_ROWS.length} staff members ready (verified, assignable).`);
}
