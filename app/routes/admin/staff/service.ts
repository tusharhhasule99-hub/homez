import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../utils/prisma';
import { publicStaffSelect, type PublicStaff } from '../../staff/staffPublic';

class adminStaffService {
    list = async (opts: { kycIncomplete?: boolean }) => {
        try {
            const where: Prisma.StaffWhereInput = {
                is_deleted: false,
            };
            if (opts.kycIncomplete) {
                where.kyc_status = { not: 'VERIFIED' };
            }

            const rows = await prisma.staff.findMany({
                where,
                orderBy: { updated_at: 'desc' },
                take: 500,
                select: publicStaffSelect,
            });
            return { success: true as const, message: 'OK', data: rows };
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
