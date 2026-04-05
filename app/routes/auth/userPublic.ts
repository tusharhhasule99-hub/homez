import type { Users } from '../../generated/prisma/client';

const publicUserSelect = {
    id: true,
    phone_number: true,
    is_active: true,
    is_deleted: true,
    is_verified: true,
    created_at: true,
    updated_at: true,
} as const;

export type PublicUser = Pick<Users, keyof typeof publicUserSelect>;

export { publicUserSelect };
