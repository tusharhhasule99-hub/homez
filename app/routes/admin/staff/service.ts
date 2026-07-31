import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../utils/prisma';
import { normalizePhoneForStorage } from '../../../utils/phone';
import { paginateResult } from '../../../utils/pagination';
import { publicStaffSelect, type PublicStaff } from '../../staff/staffPublic';

class adminStaffService {
    list = async (opts: {
        kycIncomplete?: boolean;
        q?: string | null;
        page: number;
        pageSize: number;
        skip: number;
    }) => {
        try {
            const where: Prisma.StaffWhereInput = {
                is_deleted: false,
            };
            if (opts.kycIncomplete) {
                where.kyc_status = { not: 'VERIFIED' };
            }
            if (opts.q?.trim()) {
                const q = opts.q.trim();
                where.OR = [
                    { name: { contains: q, mode: 'insensitive' } },
                    { phone_number: { contains: q } },
                    { role_title: { contains: q, mode: 'insensitive' } },
                ];
            }

            const [total, rows] = await Promise.all([
                prisma.staff.count({ where }),
                prisma.staff.findMany({
                    where,
                    orderBy: { updated_at: 'desc' },
                    skip: opts.skip,
                    take: opts.pageSize,
                    select: publicStaffSelect,
                }),
            ]);
            return {
                success: true as const,
                message: 'OK',
                data: paginateResult(rows, total, opts.page, opts.pageSize),
            };
        } catch (error) {
            console.error('Error in admin staff list', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    getById = async (id: string) => {
        try {
            const row = await prisma.staff.findFirst({
                where: { id, is_deleted: false },
                select: publicStaffSelect,
            });
            if (!row) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }
            return { success: true as const, message: 'OK', data: row };
        } catch (error) {
            console.error('Error in admin staff getById', error);
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
            const nameRaw = body.name;
            if (typeof phoneRaw !== 'string' || !phoneRaw.trim()) {
                return { success: false as const, message: 'phone_number is required.', code: 'VALIDATION' as const };
            }
            if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
                return { success: false as const, message: 'name is required.', code: 'VALIDATION' as const };
            }

            const phone_number = normalizePhoneForStorage(phoneRaw);
            if (!phone_number) {
                return { success: false as const, message: 'phone_number is invalid.', code: 'VALIDATION' as const };
            }

            const existing = await prisma.staff.findUnique({ where: { phone_number } });
            if (existing && !existing.is_deleted) {
                return {
                    success: false as const,
                    message: 'A staff member with this phone already exists.',
                    code: 'DUPLICATE_PHONE' as const,
                };
            }

            const gender =
                typeof body.gender === 'string' && body.gender.trim() ? body.gender.trim().toLowerCase() : null;
            const role_title =
                typeof body.role_title === 'string' && body.role_title.trim() ? body.role_title.trim() : null;

            let row: PublicStaff;
            if (existing?.is_deleted) {
                row = await prisma.staff.update({
                    where: { id: existing.id },
                    data: {
                        name: nameRaw.trim(),
                        gender,
                        role_title,
                        is_deleted: false,
                        is_active: true,
                        kyc_status: 'PENDING',
                        is_phone_verified: false,
                        is_photo_verified: false,
                        is_docs_verified: false,
                    },
                    select: publicStaffSelect,
                });
            } else {
                row = await prisma.staff.create({
                    data: {
                        phone_number,
                        name: nameRaw.trim(),
                        gender,
                        role_title,
                        kyc_status: 'PENDING',
                    },
                    select: publicStaffSelect,
                });
            }

            return { success: true as const, message: 'Staff created.', data: row };
        } catch (error) {
            console.error('Error in admin staff create', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    update = async (id: string, body: Record<string, unknown>) => {
        try {
            const existing = await prisma.staff.findFirst({ where: { id, is_deleted: false } });
            if (!existing) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }

            const data: Prisma.StaffUpdateInput = {};
            if ('name' in body) {
                if (typeof body.name !== 'string' || !body.name.trim()) {
                    return { success: false as const, message: 'name cannot be empty.', code: 'VALIDATION' as const };
                }
                data.name = body.name.trim();
            }
            if ('gender' in body) {
                data.gender =
                    typeof body.gender === 'string' && body.gender.trim() ? body.gender.trim().toLowerCase() : null;
            }
            if ('role_title' in body) {
                data.role_title =
                    typeof body.role_title === 'string' && body.role_title.trim() ? body.role_title.trim() : null;
            }
            if ('is_active' in body && typeof body.is_active === 'boolean') {
                data.is_active = body.is_active;
            }
            if ('is_deleted' in body && typeof body.is_deleted === 'boolean') {
                data.is_deleted = body.is_deleted;
            }
            if ('phone_number' in body && typeof body.phone_number === 'string') {
                const normalized = normalizePhoneForStorage(body.phone_number);
                if (!normalized) {
                    return { success: false as const, message: 'phone_number is invalid.', code: 'VALIDATION' as const };
                }
                const dup = await prisma.staff.findFirst({
                    where: { phone_number: normalized, NOT: { id } },
                });
                if (dup) {
                    return {
                        success: false as const,
                        message: 'Another staff member already uses this phone.',
                        code: 'DUPLICATE_PHONE' as const,
                    };
                }
                data.phone_number = normalized;
            }

            if (Object.keys(data).length === 0) {
                const row = await prisma.staff.findUniqueOrThrow({ where: { id }, select: publicStaffSelect });
                return { success: true as const, message: 'No changes.', data: row };
            }

            const updated = await prisma.staff.update({
                where: { id },
                data,
                select: publicStaffSelect,
            });
            return { success: true as const, message: 'Staff updated.', data: updated };
        } catch (error) {
            console.error('Error in admin staff update', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    updateKyc = async (id: string, decision: 'approve' | 'reject') => {
        try {
            const existing = await prisma.staff.findFirst({
                where: { id, is_deleted: false },
                select: { id: true },
            });
            if (!existing) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }

            const data: Prisma.StaffUpdateInput =
                decision === 'approve'
                    ? {
                          kyc_status: 'VERIFIED',
                          is_phone_verified: true,
                          is_photo_verified: true,
                          is_docs_verified: true,
                      }
                    : {
                          kyc_status: 'REJECTED',
                      };

            const updated: PublicStaff = await prisma.staff.update({
                where: { id },
                data,
                select: publicStaffSelect,
            });

            return {
                success: true as const,
                message: decision === 'approve' ? 'KYC approved.' : 'KYC rejected.',
                data: updated,
            };
        } catch (error) {
            console.error('Error in admin staff updateKyc', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminStaffService;
