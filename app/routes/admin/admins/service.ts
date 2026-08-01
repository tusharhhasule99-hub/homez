import bcrypt from 'bcryptjs';
import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../utils/prisma';
import { paginateResult } from '../../../utils/pagination';

const publicAdminSelect = {
    id: true,
    email: true,
    name: true,
    is_active: true,
    created_at: true,
    updated_at: true,
} as const;

export type PublicAdmin = {
    id: string;
    email: string;
    name: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
};

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

class adminAdminsService {
    list = async (opts: { page: number; pageSize: number; skip: number; q: string | null }) => {
        try {
            const where: Prisma.AdminWhereInput = {};
            if (opts.q?.trim()) {
                const q = opts.q.trim();
                where.OR = [
                    { email: { contains: q, mode: 'insensitive' } },
                    { name: { contains: q, mode: 'insensitive' } },
                ];
            }

            const [rows, total] = await Promise.all([
                prisma.admin.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    skip: opts.skip,
                    take: opts.pageSize,
                    select: publicAdminSelect,
                }),
                prisma.admin.count({ where }),
            ]);

            return {
                success: true as const,
                message: 'OK',
                data: paginateResult(rows, total, opts.page, opts.pageSize),
            };
        } catch (error) {
            console.error('Error in admin admins list', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    create = async (body: Record<string, unknown>) => {
        try {
            const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
            const password = typeof body.password === 'string' ? body.password : '';
            const name =
                typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;

            if (!emailRaw || !isValidEmail(emailRaw)) {
                return { success: false as const, message: 'A valid email is required.', code: 'VALIDATION' as const };
            }
            if (!password || password.length < MIN_PASSWORD_LENGTH) {
                return {
                    success: false as const,
                    message: `password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
                    code: 'VALIDATION' as const,
                };
            }

            const existing = await prisma.admin.findUnique({ where: { email: emailRaw } });
            if (existing) {
                return {
                    success: false as const,
                    message: 'An admin with this email already exists.',
                    code: 'DUPLICATE_EMAIL' as const,
                };
            }

            const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            const row: PublicAdmin = await prisma.admin.create({
                data: {
                    email: emailRaw,
                    password_hash,
                    name,
                    is_active: true,
                },
                select: publicAdminSelect,
            });

            return { success: true as const, message: 'Admin created.', data: row };
        } catch (error) {
            console.error('Error in admin admins create', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    update = async (id: string, body: Record<string, unknown>) => {
        try {
            const existing = await prisma.admin.findUnique({ where: { id } });
            if (!existing) {
                return { success: false as const, message: 'Admin not found.', code: 'NOT_FOUND' as const };
            }

            const data: Prisma.AdminUpdateInput = {};

            if ('name' in body) {
                data.name =
                    typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
            }
            if ('is_active' in body && typeof body.is_active === 'boolean') {
                data.is_active = body.is_active;
            }
            if ('password' in body) {
                const password = typeof body.password === 'string' ? body.password : '';
                if (!password || password.length < MIN_PASSWORD_LENGTH) {
                    return {
                        success: false as const,
                        message: `password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
                        code: 'VALIDATION' as const,
                    };
                }
                data.password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            }
            if ('email' in body) {
                const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
                if (!emailRaw || !isValidEmail(emailRaw)) {
                    return {
                        success: false as const,
                        message: 'A valid email is required.',
                        code: 'VALIDATION' as const,
                    };
                }
                if (emailRaw !== existing.email) {
                    const dup = await prisma.admin.findUnique({ where: { email: emailRaw } });
                    if (dup) {
                        return {
                            success: false as const,
                            message: 'An admin with this email already exists.',
                            code: 'DUPLICATE_EMAIL' as const,
                        };
                    }
                    data.email = emailRaw;
                }
            }

            if (Object.keys(data).length === 0) {
                const row = await prisma.admin.findUniqueOrThrow({
                    where: { id },
                    select: publicAdminSelect,
                });
                return { success: true as const, message: 'No changes.', data: row };
            }

            const updated: PublicAdmin = await prisma.admin.update({
                where: { id },
                data,
                select: publicAdminSelect,
            });

            return { success: true as const, message: 'Admin updated.', data: updated };
        } catch (error) {
            console.error('Error in admin admins update', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminAdminsService;
