import { sendOtpSms } from '../../services/twilioOtpSms';
import { hashOtp, MissingOtpSecretError, OTP_TTL_MS, verifyOtpHash, generateOtpCode } from '../../utils/otpCrypto';
import { normalizePhoneForStorage } from '../../utils/phone';
import { prisma } from '../../utils/prisma';
import { signStaffAccessToken, MissingStaffJwtSecretError } from '../../utils/authToken';
import { publicStaffSelect, type PublicStaff } from './staffPublic';

const DEV_STATIC_OTP = '123456';

function isProductionBackend(): boolean {
    return process.env.NODE_ENV === 'production';
}

function otpExpiry(): Date {
    return new Date(Date.now() + OTP_TTL_MS);
}

async function persistOtpAndSend(staffId: string, normalizedPhone: string): Promise<void> {
    const code = isProductionBackend() ? generateOtpCode() : DEV_STATIC_OTP;
    const hash = hashOtp(code);

    await prisma.staff.update({
        where: { id: staffId },
        data: { otp_hash: hash, otp_expires_at: otpExpiry() },
    });

    if (isProductionBackend()) {
        await sendOtpSms(normalizedPhone, code);
    }
}

class staffService {
    uploadAsset = async (
        staffId: string,
        useCase: 'profile' | 'media',
        file: {
            url: string;
            key: string;
            bucket: string;
            contentType: string;
            size: number;
            originalName: string;
        },
    ) => {
        try {
            const existing = await prisma.staff.findUnique({
                where: { id: staffId },
                select: { id: true, is_active: true, is_deleted: true, docs: true },
            });
            if (!existing || !existing.is_active || existing.is_deleted) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }

            if (useCase === 'profile') {
                const updated: PublicStaff = await prisma.staff.update({
                    where: { id: staffId },
                    data: {
                        profile_photo_url: file.url,
                        is_photo_verified: false,
                        kyc_status: 'PENDING',
                    },
                    select: publicStaffSelect,
                });

                return {
                    success: true as const,
                    message: 'Profile photo uploaded successfully.',
                    data: updated,
                };
            }

            const existingDocs = Array.isArray(existing.docs) ? existing.docs : [];
            const nextDocs = [
                ...existingDocs,
                {
                    type: 'media',
                    name: file.originalName,
                    url: file.url,
                    key: file.key,
                    bucket: file.bucket,
                    content_type: file.contentType,
                    size: file.size,
                },
            ];

            const updated: PublicStaff = await prisma.staff.update({
                where: { id: staffId },
                data: {
                    docs: nextDocs,
                    is_docs_verified: false,
                    kyc_status: 'PENDING',
                },
                select: publicStaffSelect,
            });

            return {
                success: true as const,
                message: 'Media uploaded successfully.',
                data: updated,
            };
        } catch (error) {
            console.error('Error in staff uploadAsset', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    login = async (phone_number: string) => {
        try {
            const normalized = normalizePhoneForStorage(phone_number);
            if (!normalized) {
                return { success: false as const, message: 'Phone number is required.', code: 'VALIDATION' as const };
            }

            const staff = await prisma.staff.findUnique({ where: { phone_number: normalized } });
            if (!staff || !staff.is_active || staff.is_deleted) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }

            await persistOtpAndSend(staff.id, normalized);

            const slim: PublicStaff = await prisma.staff.findUniqueOrThrow({
                where: { id: staff.id },
                select: publicStaffSelect,
            });

            return {
                success: true as const,
                message: 'OTP sent. Verify to continue.',
                data: slim,
            };
        } catch (error) {
            if (error instanceof MissingOtpSecretError) {
                return {
                    success: false as const,
                    message: 'Server configuration error.',
                    code: 'SERVER_CONFIG' as const,
                };
            }
            console.error('Error in staff login', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    register = async (body: Record<string, unknown>) => {
        try {
            const phoneRaw = body.phone_number;
            const nameRaw = body.name;
            const genderRaw = body.gender;
            const roleTitleRaw = body.role_title;
            const photoUrlRaw = body.profile_photo_url;
            const docsRaw = body.docs;

            if (typeof phoneRaw !== 'string' || !phoneRaw.trim()) {
                return { success: false as const, message: 'phone_number is required.', code: 'VALIDATION' as const };
            }
            if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
                return { success: false as const, message: 'name is required.', code: 'VALIDATION' as const };
            }

            const phone_number = normalizePhoneForStorage(phoneRaw);
            const name = nameRaw.trim();
            const gender = typeof genderRaw === 'string' && genderRaw.trim() ? genderRaw.trim().toLowerCase() : null;
            const role_title = typeof roleTitleRaw === 'string' && roleTitleRaw.trim() ? roleTitleRaw.trim() : null;
            const profile_photo_url =
                typeof photoUrlRaw === 'string' && photoUrlRaw.trim() ? photoUrlRaw.trim() : null;
            const docs = Array.isArray(docsRaw) ? docsRaw : [];

            let staff = await prisma.staff.findUnique({ where: { phone_number } });

            if (!staff) {
                staff = await prisma.staff.create({
                    data: {
                        phone_number,
                        name,
                        gender,
                        role_title,
                        profile_photo_url,
                        docs,
                        is_phone_verified: false,
                        is_photo_verified: false,
                        is_docs_verified: false,
                        kyc_status: 'PENDING',
                    },
                });
            } else {
                staff = await prisma.staff.update({
                    where: { id: staff.id },
                    data: {
                        name,
                        gender,
                        role_title,
                        profile_photo_url,
                        docs,
                        // Any profile update before admin check resets verification status.
                        is_photo_verified: false,
                        is_docs_verified: false,
                        kyc_status: 'PENDING',
                    },
                });
            }

            await persistOtpAndSend(staff.id, phone_number);

            const slim: PublicStaff = await prisma.staff.findUniqueOrThrow({
                where: { id: staff.id },
                select: publicStaffSelect,
            });

            return {
                success: true as const,
                message: 'Staff registered. OTP sent for phone verification.',
                data: slim,
            };
        } catch (error) {
            if (error instanceof MissingOtpSecretError) {
                return {
                    success: false as const,
                    message: 'Server configuration error.',
                    code: 'SERVER_CONFIG' as const,
                };
            }
            console.error('Error in staff register', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    resendOtp = async (phone_number: string) => {
        try {
            const normalized = normalizePhoneForStorage(phone_number);
            if (!normalized) {
                return { success: false as const, message: 'Phone number is required', code: 'VALIDATION' as const };
            }

            const staff = await prisma.staff.findUnique({ where: { phone_number: normalized } });
            if (!staff || !staff.is_active || staff.is_deleted) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }

            await persistOtpAndSend(staff.id, normalized);

            return {
                success: true as const,
                message: 'OTP resent successfully.',
            };
        } catch (error) {
            if (error instanceof MissingOtpSecretError) {
                return {
                    success: false as const,
                    message: 'Server configuration error.',
                    code: 'SERVER_CONFIG' as const,
                };
            }
            console.error('Error in staff resendOtp', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    verifyOtp = async (phone_number: string, otp: string) => {
        try {
            const normalized = normalizePhoneForStorage(phone_number);
            const code = otp?.trim();
            if (!normalized || !code) {
                return {
                    success: false as const,
                    message: 'Phone number and OTP are required.',
                    code: 'VALIDATION' as const,
                };
            }

            const staff = await prisma.staff.findUnique({ where: { phone_number: normalized } });
            if (!staff || !staff.is_active || staff.is_deleted) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }

            if (!staff.otp_expires_at || staff.otp_expires_at <= new Date()) {
                return {
                    success: false as const,
                    message: 'OTP expired or not requested.',
                    code: 'OTP_EXPIRED' as const,
                };
            }
            if (!verifyOtpHash(code, staff.otp_hash)) {
                return {
                    success: false as const,
                    message: 'Invalid OTP.',
                    code: 'INVALID_OTP' as const,
                };
            }

            const updated: PublicStaff = await prisma.staff.update({
                where: { id: staff.id },
                data: {
                    is_phone_verified: true,
                    otp_hash: null,
                    otp_expires_at: null,
                },
                select: publicStaffSelect,
            });

            const token = signStaffAccessToken({
                sub: updated.id,
                phone_number: updated.phone_number,
            });

            return {
                success: true as const,
                message: 'Phone verified successfully.',
                data: {
                    token,
                    staff: updated,
                },
            };
        } catch (error) {
            if (error instanceof MissingOtpSecretError || error instanceof MissingStaffJwtSecretError) {
                return {
                    success: false as const,
                    message: 'Server configuration error.',
                    code: 'SERVER_CONFIG' as const,
                };
            }
            console.error('Error in staff verifyOtp', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default staffService;
