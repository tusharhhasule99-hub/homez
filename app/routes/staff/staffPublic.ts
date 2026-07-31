export const publicStaffSelect = {
    id: true,
    phone_number: true,
    name: true,
    gender: true,
    role_title: true,
    is_phone_verified: true,
    is_photo_verified: true,
    is_docs_verified: true,
    kyc_status: true,
    is_onboarding_completed: true,
    onboarding_step: true,
    profile_photo_url: true,
    docs: true,
    latitude: true,
    longitude: true,
    is_available: true,
    last_seen_at: true,
    created_at: true,
    updated_at: true,
} as const;

export type PublicStaff = {
    id: string;
    phone_number: string;
    name: string;
    gender: string | null;
    role_title: string | null;
    is_phone_verified: boolean;
    is_photo_verified: boolean;
    is_docs_verified: boolean;
    kyc_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
    is_onboarding_completed: boolean;
    onboarding_step: number;
    profile_photo_url: string | null;
    docs: unknown;
    latitude: number | null;
    longitude: number | null;
    is_available: boolean;
    last_seen_at: Date | null;
    created_at: Date;
    updated_at: Date;
};
