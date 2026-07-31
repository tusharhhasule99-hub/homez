export const publicStaffSelect = {
    id: true,
    phone_number: true,
    name: true,
    first_name: true,
    last_name: true,
    gender: true,
    role_title: true,
    expertise: true,
    years_experience: true,
    work_city: true,
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
    first_name: string | null;
    last_name: string | null;
    gender: string | null;
    role_title: string | null;
    expertise: string | null;
    years_experience: number | null;
    work_city: string | null;
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

/** Join first + last into the denormalized `name` used by bookings/dispatch. */
export function staffDisplayName(first_name: string, last_name: string): string {
    return `${first_name.trim()} ${last_name.trim()}`.replace(/\s+/g, ' ').trim();
}
