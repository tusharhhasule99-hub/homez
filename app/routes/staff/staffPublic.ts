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
    profile_photo_url: true,
    docs: true,
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
    profile_photo_url: string | null;
    docs: unknown;
    created_at: Date;
    updated_at: Date;
};
