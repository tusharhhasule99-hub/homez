import { sendOtpSms } from '../../services/twilioOtpSms';
import { hashOtp, MissingOtpSecretError, OTP_TTL_MS, verifyOtpHash, generateOtpCode } from '../../utils/otpCrypto';
import { normalizePhoneForStorage } from '../../utils/phone';
import { prisma } from '../../utils/prisma';
import { signStaffAccessToken, MissingStaffJwtSecretError } from '../../utils/authToken';
import { publicStaffSelect, type PublicStaff } from './staffPublic';
import { expireStaffOffers } from './jobs/dispatchService';

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
    /** Location ping from the staff app. Updates coords + freshness timestamp. */
    updateLocation = async (staffId: string, body: Record<string, unknown>) => {
        try {
            const lat = Number(body.latitude);
            const lng = Number(body.longitude);
            if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
                return { success: false as const, message: 'latitude must be between -90 and 90.', code: 'VALIDATION' as const };
            }
            if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
                return { success: false as const, message: 'longitude must be between -180 and 180.', code: 'VALIDATION' as const };
            }

            const existing = await prisma.staff.findUnique({
                where: { id: staffId },
                select: { id: true, is_active: true, is_deleted: true },
            });
            if (!existing || !existing.is_active || existing.is_deleted) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }

            const updated: PublicStaff = await prisma.staff.update({
                where: { id: staffId },
                data: { latitude: lat, longitude: lng, last_seen_at: new Date() },
                select: publicStaffSelect,
            });

            return { success: true as const, message: 'Location updated.', data: updated };
        } catch (error) {
            console.error('Error in staff updateLocation', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    /** Online/offline toggle. Going offline expires the staff's pending offers. */
    setAvailability = async (staffId: string, body: Record<string, unknown>) => {
        try {
            if (typeof body.is_available !== 'boolean') {
                return { success: false as const, message: 'is_available must be a boolean.', code: 'VALIDATION' as const };
            }
            const isAvailable = body.is_available;

            const existing = await prisma.staff.findUnique({
                where: { id: staffId },
                select: { id: true, is_active: true, is_deleted: true },
            });
            if (!existing || !existing.is_active || existing.is_deleted) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }

            const updated: PublicStaff = await prisma.staff.update({
                where: { id: staffId },
                data: {
                    is_available: isAvailable,
                    // Refresh freshness when coming online so dispatch sees them.
                    ...(isAvailable ? { last_seen_at: new Date() } : {}),
                },
                select: publicStaffSelect,
            });

            if (!isAvailable) {
                await expireStaffOffers(staffId);
            }

            return { success: true as const, message: 'Availability updated.', data: updated };
        } catch (error) {
            console.error('Error in staff setAvailability', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

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

    /**
     * Combined register + login.
     * - Existing staff: phone_number only → send OTP.
     * - New staff: phone_number + name (optional profile fields) → create, then send OTP.
     * - Existing staff with profile fields: updates profile, then sends OTP.
     */
    login = async (body: Record<string, unknown>) => {
        try {
            const phoneRaw = body.phone_number;
            if (typeof phoneRaw !== 'string' || !phoneRaw.trim()) {
                return { success: false as const, message: 'phone_number is required.', code: 'VALIDATION' as const };
            }

            const phone_number = normalizePhoneForStorage(phoneRaw);
            if (!phone_number) {
                return { success: false as const, message: 'phone_number is required.', code: 'VALIDATION' as const };
            }

            const nameRaw = body.name;
            const genderRaw = body.gender;
            const roleTitleRaw = body.role_title;
            const photoUrlRaw = body.profile_photo_url;
            const docsRaw = body.docs;

            const hasName = typeof nameRaw === 'string' && !!nameRaw.trim();
            const hasGender = typeof genderRaw === 'string' && !!genderRaw.trim();
            const hasRoleTitle = typeof roleTitleRaw === 'string' && !!roleTitleRaw.trim();
            const hasPhoto = typeof photoUrlRaw === 'string' && !!photoUrlRaw.trim();
            const hasDocs = Array.isArray(docsRaw);
            const hasProfileUpdate = hasName || hasGender || hasRoleTitle || hasPhoto || hasDocs;

            let staff = await prisma.staff.findUnique({ where: { phone_number } });

            if (!staff) {
                if (!hasName) {
                    return {
                        success: false as const,
                        message: 'name is required for new staff registration.',
                        code: 'VALIDATION' as const,
                    };
                }

                staff = await prisma.staff.create({
                    data: {
                        phone_number,
                        name: (nameRaw as string).trim(),
                        gender: hasGender ? (genderRaw as string).trim().toLowerCase() : null,
                        role_title: hasRoleTitle ? (roleTitleRaw as string).trim() : null,
                        profile_photo_url: hasPhoto ? (photoUrlRaw as string).trim() : null,
                        docs: hasDocs ? docsRaw : [],
                        is_phone_verified: false,
                        is_photo_verified: false,
                        is_docs_verified: false,
                        kyc_status: 'PENDING',
                    },
                });
            } else {
                if (!staff.is_active || staff.is_deleted) {
                    return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
                }

                if (hasProfileUpdate) {
                    staff = await prisma.staff.update({
                        where: { id: staff.id },
                        data: {
                            ...(hasName ? { name: (nameRaw as string).trim() } : {}),
                            ...(hasGender ? { gender: (genderRaw as string).trim().toLowerCase() } : {}),
                            ...(hasRoleTitle ? { role_title: (roleTitleRaw as string).trim() } : {}),
                            ...(hasPhoto ? { profile_photo_url: (photoUrlRaw as string).trim() } : {}),
                            ...(hasDocs ? { docs: docsRaw } : {}),
                            // Profile changes reset verification pending admin review.
                            ...(hasPhoto || hasDocs
                                ? {
                                      is_photo_verified: hasPhoto ? false : undefined,
                                      is_docs_verified: hasDocs ? false : undefined,
                                      kyc_status: 'PENDING' as const,
                                  }
                                : {}),
                        },
                    });
                }
            }

            await persistOtpAndSend(staff.id, phone_number);

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
