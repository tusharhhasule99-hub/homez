import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../utils/prisma';
import { normalizePhoneForStorage } from '../../../utils/phone';

export const publicUserAdminSelect = {
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

export type PublicUserAdmin = {
    id: string;
    phone_number: string;
    is_active: boolean;
    is_deleted: boolean;
    is_verified: boolean;
    name: string | null;
    gender: string | null;
    is_onboarding_completed: boolean;
    onboarding_step: number;
    created_at: Date;
    updated_at: Date;
};

class adminUsersService {
    list = async () => {
        try {
            const rows = await prisma.users.findMany({
                where: { is_deleted: false },
                orderBy: { created_at: 'desc' },
                take: 500,
                select: publicUserAdminSelect,
            });
            return { success: true as const, message: 'OK', data: rows };
        } catch (error) {
            console.error('Error in admin users list', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    getById = async (id: string) => {
        try {
            const row = await prisma.users.findFirst({
                where: { id },
                select: publicUserAdminSelect,
            });
            if (!row) {
                return { success: false as const, message: 'User not found.', code: 'USER_NOT_FOUND' as const };
            }
            return { success: true as const, message: 'OK', data: row };
        } catch (error) {
            console.error('Error in admin users getById', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    create = async (body: Record<string, unknown>) => {
        try {
            const phoneRaw = body.phone_number;
            if (typeof phoneRaw !== 'string' || !phoneRaw.trim()) {
                return { success: false as const, message: 'phone_number is required.', code: 'VALIDATION' as const };
            }

            const phone_number = normalizePhoneForStorage(phoneRaw);
            if (!phone_number) {
                return { success: false as const, message: 'phone_number is invalid.', code: 'VALIDATION' as const };
            }

            const existing = await prisma.users.findFirst({
                where: { phone_number, is_deleted: false },
            });
            if (existing) {
                return {
                    success: false as const,
                    message: 'A user with this phone number already exists.',
                    code: 'DUPLICATE_PHONE' as const,
                };
            }

            const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
            const gender = typeof body.gender === 'string' && body.gender.trim() ? body.gender.trim().toLowerCase() : null;
            const is_active = typeof body.is_active === 'boolean' ? body.is_active : true;
            const is_verified = typeof body.is_verified === 'boolean' ? body.is_verified : false;

            const created: PublicUserAdmin = await prisma.users.create({
                data: {
                    phone_number,
                    name,
                    gender,
                    is_active,
                    is_verified,
                },
                select: publicUserAdminSelect,
            });

            return { success: true as const, message: 'User created.', data: created };
        } catch (error) {
            console.error('Error in admin users create', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    update = async (id: string, body: Record<string, unknown>) => {
        try {
            const existing = await prisma.users.findFirst({ where: { id } });
            if (!existing) {
                return { success: false as const, message: 'User not found.', code: 'USER_NOT_FOUND' as const };
            }

            const data: Record<string, unknown> = {};

            if ('name' in body) {
                data.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
            }
            if ('gender' in body) {
                data.gender =
                    typeof body.gender === 'string' && body.gender.trim() ? body.gender.trim().toLowerCase() : null;
            }
            if ('is_active' in body && typeof body.is_active === 'boolean') {
                data.is_active = body.is_active;
            }
            if ('is_deleted' in body && typeof body.is_deleted === 'boolean') {
                data.is_deleted = body.is_deleted;
            }
            if ('is_verified' in body && typeof body.is_verified === 'boolean') {
                data.is_verified = body.is_verified;
            }
            if ('is_onboarding_completed' in body && typeof body.is_onboarding_completed === 'boolean') {
                data.is_onboarding_completed = body.is_onboarding_completed;
            }
            if ('onboarding_step' in body && typeof body.onboarding_step === 'number' && Number.isFinite(body.onboarding_step)) {
                data.onboarding_step = Math.max(1, Math.floor(body.onboarding_step));
            }

            if ('phone_number' in body && typeof body.phone_number === 'string') {
                const normalized = normalizePhoneForStorage(body.phone_number);
                if (!normalized) {
                    return { success: false as const, message: 'phone_number is invalid.', code: 'VALIDATION' as const };
                }
                const dup = await prisma.users.findFirst({
                    where: { phone_number: normalized, NOT: { id } },
                });
                if (dup) {
                    return {
                        success: false as const,
                        message: 'Another user already uses this phone number.',
                        code: 'DUPLICATE_PHONE' as const,
                    };
                }
                data.phone_number = normalized;
            }

            if (Object.keys(data).length === 0) {
                const row: PublicUserAdmin = await prisma.users.findUniqueOrThrow({
                    where: { id },
                    select: publicUserAdminSelect,
                });
                return { success: true as const, message: 'No changes.', data: row };
            }

            const updated: PublicUserAdmin = await prisma.users.update({
                where: { id },
                data: data as Prisma.UsersUpdateInput,
                select: publicUserAdminSelect,
            });

            return { success: true as const, message: 'User updated.', data: updated };
        } catch (error) {
            console.error('Error in admin users update', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminUsersService;
