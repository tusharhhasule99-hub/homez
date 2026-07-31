import { sendOtpSms } from '../../services/twilioOtpSms';
import { hashOtp, MissingOtpSecretError, OTP_TTL_MS, verifyOtpHash, generateOtpCode } from '../../utils/otpCrypto';
import { normalizePhoneForStorage } from '../../utils/phone';
import { prisma } from '../../utils/prisma';
import { signStaffAccessToken, MissingStaffJwtSecretError } from '../../utils/authToken';
import { publicStaffSelect, staffDisplayName, type PublicStaff } from './staffPublic';
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
     * OTP login (phone only). Creates staff on first login if missing.
     * Optional profile fields (first_name / last_name, gender, …) update the record when sent.
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

            const firstRaw = body.first_name;
            const lastRaw = body.last_name;
            const nameRaw = body.name;
            const genderRaw = body.gender;
            const roleTitleRaw = body.role_title;
            const photoUrlRaw = body.profile_photo_url;
            const docsRaw = body.docs;

            const hasFirst = typeof firstRaw === 'string' && !!firstRaw.trim();
            const hasLast = typeof lastRaw === 'string' && !!lastRaw.trim();
            const hasNameParts = hasFirst && hasLast;
            const hasName = typeof nameRaw === 'string' && !!nameRaw.trim();
            const hasGender = typeof genderRaw === 'string' && !!genderRaw.trim();
            const hasRoleTitle = typeof roleTitleRaw === 'string' && !!roleTitleRaw.trim();
            const hasPhoto = typeof photoUrlRaw === 'string' && !!photoUrlRaw.trim();
            const hasDocs = Array.isArray(docsRaw);
            const hasProfileUpdate =
                hasNameParts || hasName || hasGender || hasRoleTitle || hasPhoto || hasDocs;

            let staff = await prisma.staff.findUnique({ where: { phone_number } });

            if (!staff) {
                // Phone-only OTP login — same pattern as customer auth. Name filled in onboarding.
                const first_name = hasFirst ? (firstRaw as string).trim() : 'Staff';
                const last_name = hasLast ? (lastRaw as string).trim() : phone_number.slice(-4);
                const name = hasNameParts
                    ? staffDisplayName(first_name, last_name)
                    : hasName
                      ? (nameRaw as string).trim()
                      : staffDisplayName(first_name, last_name);
                staff = await prisma.staff.create({
                    data: {
                        phone_number,
                        name,
                        first_name,
                        last_name,
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
                    const nameUpdate = hasNameParts
                        ? {
                              first_name: (firstRaw as string).trim(),
                              last_name: (lastRaw as string).trim(),
                              name: staffDisplayName(
                                  (firstRaw as string).trim(),
                                  (lastRaw as string).trim(),
                              ),
                          }
                        : hasName
                          ? { name: (nameRaw as string).trim() }
                          : {};
                    staff = await prisma.staff.update({
                        where: { id: staff.id },
                        data: {
                            ...nameUpdate,
                            ...(hasGender ? { gender: (genderRaw as string).trim().toLowerCase() } : {}),
                            ...(hasRoleTitle ? { role_title: (roleTitleRaw as string).trim() } : {}),
                            ...(hasPhoto ? { profile_photo_url: (photoUrlRaw as string).trim() } : {}),
                            ...(hasDocs ? { docs: docsRaw } : {}),
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
                message: 'Verified.',
                data: {
                    token,
                    staff: updated,
                    is_onboarding_completed: updated.is_onboarding_completed,
                    onboarding_step: updated.onboarding_step,
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

    getMe = async (staffId: string) => {
        try {
            const staff = await prisma.staff.findFirst({
                where: { id: staffId, is_active: true, is_deleted: false },
                select: publicStaffSelect,
            });
            if (!staff) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }
            return {
                success: true as const,
                message: 'OK',
                data: {
                    staff,
                    is_onboarding_completed: staff.is_onboarding_completed,
                    onboarding_step: staff.onboarding_step,
                },
            };
        } catch (error) {
            console.error('Error in staff getMe', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    /**
     * Staff onboarding (JWT required).
     * Step 1 — profile_photo_url, first_name, last_name, expertise, years_experience, work_city
     * Step 2 — docs (upload via POST /staff/upload?use_case=media, then pass metadata)
     */
    submitOnboardingStep = async (staffId: string, body: Record<string, unknown>) => {
        try {
            const step = body.step;
            if (step !== 1 && step !== 2) {
                return {
                    success: false as const,
                    message: 'step must be 1 (profile) or 2 (documents).',
                    code: 'INVALID_STEP' as const,
                };
            }

            const staff = await prisma.staff.findFirst({
                where: { id: staffId, is_active: true, is_deleted: false },
            });
            if (!staff) {
                return { success: false as const, message: 'Staff not found.', code: 'STAFF_NOT_FOUND' as const };
            }
            if (!staff.is_phone_verified) {
                return {
                    success: false as const,
                    message: 'Verify your phone before onboarding.',
                    code: 'NOT_VERIFIED' as const,
                };
            }
            if (staff.is_onboarding_completed) {
                return {
                    success: false as const,
                    message: 'Onboarding is already complete.',
                    code: 'ONBOARDING_COMPLETE' as const,
                };
            }

            if (step === 1) {
                if (staff.onboarding_step !== 1) {
                    return {
                        success: false as const,
                        message: 'Step 1 is already done. Continue with step 2 (documents).',
                        code: 'INVALID_STEP_ORDER' as const,
                    };
                }

                const firstRaw = typeof body.first_name === 'string' ? body.first_name.trim() : '';
                const lastRaw = typeof body.last_name === 'string' ? body.last_name.trim() : '';
                if (!firstRaw) {
                    return {
                        success: false as const,
                        message: 'first_name is required.',
                        code: 'VALIDATION' as const,
                    };
                }
                if (!lastRaw) {
                    return {
                        success: false as const,
                        message: 'last_name is required.',
                        code: 'VALIDATION' as const,
                    };
                }
                if (firstRaw.length > 100 || lastRaw.length > 100) {
                    return {
                        success: false as const,
                        message: 'first_name and last_name must be at most 100 characters each.',
                        code: 'VALIDATION' as const,
                    };
                }
                const name = staffDisplayName(firstRaw, lastRaw);

                let profile_photo_url =
                    typeof body.profile_photo_url === 'string' ? body.profile_photo_url.trim() : '';
                if (!profile_photo_url && staff.profile_photo_url) {
                    profile_photo_url = staff.profile_photo_url;
                }
                if (!profile_photo_url) {
                    return {
                        success: false as const,
                        message:
                            'profile_photo_url is required. Upload via POST /staff/upload?use_case=profile then pass the returned url.',
                        code: 'VALIDATION' as const,
                    };
                }

                const expertiseRaw =
                    typeof body.expertise === 'string'
                        ? body.expertise.trim()
                        : typeof body.role_title === 'string'
                          ? body.role_title.trim()
                          : '';
                if (!expertiseRaw) {
                    return {
                        success: false as const,
                        message: 'expertise is required.',
                        code: 'VALIDATION' as const,
                    };
                }
                if (expertiseRaw.length > 120) {
                    return {
                        success: false as const,
                        message: 'expertise must be at most 120 characters.',
                        code: 'VALIDATION' as const,
                    };
                }

                const yearsRaw = body.years_experience ?? body.year_experience;
                const years_experience = Number(yearsRaw);
                if (
                    yearsRaw === undefined ||
                    yearsRaw === null ||
                    yearsRaw === '' ||
                    !Number.isFinite(years_experience) ||
                    years_experience < 0 ||
                    years_experience > 60 ||
                    Math.floor(years_experience) !== years_experience
                ) {
                    return {
                        success: false as const,
                        message: 'years_experience must be an integer from 0 to 60.',
                        code: 'VALIDATION' as const,
                    };
                }

                const work_city =
                    typeof body.work_city === 'string'
                        ? body.work_city.trim()
                        : typeof body.city_of_work === 'string'
                          ? body.city_of_work.trim()
                          : '';
                if (!work_city) {
                    return {
                        success: false as const,
                        message: 'work_city is required.',
                        code: 'VALIDATION' as const,
                    };
                }
                if (work_city.length > 120) {
                    return {
                        success: false as const,
                        message: 'work_city must be at most 120 characters.',
                        code: 'VALIDATION' as const,
                    };
                }

                const genderRaw =
                    typeof body.gender === 'string' ? body.gender.trim().toLowerCase() : '';
                const gender =
                    genderRaw && ['male', 'female', 'other'].includes(genderRaw) ? genderRaw : null;

                const updated: PublicStaff = await prisma.staff.update({
                    where: { id: staffId },
                    data: {
                        first_name: firstRaw,
                        last_name: lastRaw,
                        name,
                        gender,
                        expertise: expertiseRaw,
                        role_title: expertiseRaw,
                        years_experience,
                        work_city,
                        profile_photo_url,
                        is_photo_verified: false,
                        kyc_status: 'PENDING',
                        onboarding_step: 2,
                    },
                    select: publicStaffSelect,
                });

                return {
                    success: true as const,
                    message: 'Profile saved. Continue to documents.',
                    data: {
                        staff: updated,
                        is_onboarding_completed: updated.is_onboarding_completed,
                        onboarding_step: updated.onboarding_step,
                    },
                };
            }

            if (staff.onboarding_step !== 2) {
                return {
                    success: false as const,
                    message: 'Complete step 1 (profile) first.',
                    code: 'INVALID_STEP_ORDER' as const,
                };
            }

            const docsRaw = body.docs;
            const docs = Array.isArray(docsRaw) ? docsRaw : null;
            if (!docs || docs.length === 0) {
                const existingDocs = Array.isArray(staff.docs) ? staff.docs : [];
                if (existingDocs.length === 0) {
                    return {
                        success: false as const,
                        message:
                            'docs is required (non-empty array). Upload via POST /staff/upload?use_case=media then pass doc metadata, or send docs in this body.',
                        code: 'VALIDATION' as const,
                    };
                }
            }

            const nextDocs = docs && docs.length > 0 ? docs : (staff.docs as unknown[]);

            const updated: PublicStaff = await prisma.staff.update({
                where: { id: staffId },
                data: {
                    docs: nextDocs,
                    is_docs_verified: false,
                    kyc_status: 'PENDING',
                    onboarding_step: 2,
                    is_onboarding_completed: true,
                },
                select: publicStaffSelect,
            });

            return {
                success: true as const,
                message: 'Onboarding complete.',
                data: {
                    staff: updated,
                    is_onboarding_completed: updated.is_onboarding_completed,
                    onboarding_step: updated.onboarding_step,
                },
            };
        } catch (error) {
            console.error('Error in staff submitOnboardingStep', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default staffService;
