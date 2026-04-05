import type { Users } from '../../generated/prisma/client';

/** Returned from register/login (OTP sent only) — phone enrollment, no profile. */
const otpSentUserSelect = {
    id: true,
    phone_number: true,
} as const;

const publicUserSelect = {
    id: true,
    phone_number: true,
    is_active: true,
    is_deleted: true,
    is_verified: true,
    name: true,
    gender: true,
    is_onboarding_completed: true,
    onboarding_step: true,
    created_at: true,
    updated_at: true,
} as const;

export type OtpSentUser = Pick<Users, keyof typeof otpSentUserSelect>;
export type PublicUser = Pick<Users, keyof typeof publicUserSelect>;

export { otpSentUserSelect, publicUserSelect };
