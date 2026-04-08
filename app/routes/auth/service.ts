import { prisma } from '../../utils/prisma';
import { normalizePhoneForStorage } from '../../utils/phone';
import { generateOtpCode, hashOtp, verifyOtpHash, MissingOtpSecretError, OTP_TTL_MS } from '../../utils/otpCrypto';
import { sendOtpSms } from '../../services/twilioOtpSms';
import { signAccessToken, MissingJwtSecretError } from '../../utils/authToken';
import { logAuthServiceError } from '../../utils/logAuthServiceError';
import { MAX_ADDRESSES_PER_USER } from '../addresses/service';
import { otpSentUserSelect, publicUserSelect, type OtpSentUser, type PublicUser } from './userPublic';

const ALLOWED_GENDERS = new Set(['male', 'female', 'other']);
const NAME_MAX_LEN = 200;
const ONBOARDING_PINCODE = /^\d{6}$/;

async function setOnlyDefaultAddress(userId: string, addressId: string): Promise<void> {
    await prisma.$transaction([
        prisma.address.updateMany({ where: { user_id: userId }, data: { is_default: false } }),
        prisma.address.update({ where: { id: addressId }, data: { is_default: true } }),
    ]);
}

const DEV_STATIC_OTP = '123456';

function isProductionBackend(): boolean {
    return process.env.NODE_ENV === 'production';
}

function otpExpiry(): Date {
    return new Date(Date.now() + OTP_TTL_MS);
}

async function persistOtpAndSend(userId: string, normalizedPhone: string): Promise<void> {
    const code = isProductionBackend() ? generateOtpCode() : DEV_STATIC_OTP;
    const hash = hashOtp(code);
    await prisma.users.update({
        where: { id: userId },
        data: { otp_hash: hash, otp_expires_at: otpExpiry() },
    });
    if (isProductionBackend()) {
        await sendOtpSms(normalizedPhone, code);
    }
}

function normalizeGender(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const g = raw.trim().toLowerCase();
    return ALLOWED_GENDERS.has(g) ? g : null;
}

class authService {
    constructor() {}

    login = async (phone_number: string) => {
        try {
            const normalized = normalizePhoneForStorage(phone_number);
            if (!normalized) {
                return { success: false as const, message: 'Phone number is required' };
            }

            const user = await prisma.users.findFirst({
                where: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                },
            });

            const existingUserId = user?.id;
            const targetUserId = existingUserId
                ? existingUserId
                : (
                      await prisma.users.create({
                          data: {
                              phone_number: normalized,
                              is_active: true,
                              is_deleted: false,
                              is_verified: false,
                          },
                          select: { id: true },
                      })
                  ).id;

            await persistOtpAndSend(targetUserId, normalized);
            const slim: OtpSentUser = await prisma.users.findUniqueOrThrow({
                where: { id: targetUserId },
                select: otpSentUserSelect,
            });
            return {
                success: true as const,
                message: 'OTP sent. Verify your number to continue.',
                data: slim,
            };
        } catch (error) {
            if (error instanceof MissingOtpSecretError) {
                logAuthServiceError(
                    'login',
                    'persistOtpAndSend',
                    'app/utils/otpCrypto.ts#hashOtp',
                    error,
                );
                return {
                    success: false as const,
                    message: 'Server configuration error.',
                    code: 'SERVER_CONFIG' as const,
                };
            }
            logAuthServiceError('login', 'handler', 'app/routes/auth/service.ts', error);
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
                return { success: false as const, message: 'Phone number is required' };
            }

            const user = await prisma.users.findFirst({
                where: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                },
                select: { id: true },
            });

            if (!user) {
                return {
                    success: false as const,
                    message: 'User not found for this phone number. Start login first.',
                    code: 'USER_NOT_FOUND' as const,
                };
            }

            await persistOtpAndSend(user.id, normalized);
            const slim: OtpSentUser = await prisma.users.findUniqueOrThrow({
                where: { id: user.id },
                select: otpSentUserSelect,
            });
            return {
                success: true as const,
                message: 'OTP resent successfully.',
                data: slim,
            };
        } catch (error) {
            if (error instanceof MissingOtpSecretError) {
                logAuthServiceError(
                    'resendOtp',
                    'persistOtpAndSend',
                    'app/utils/otpCrypto.ts#hashOtp',
                    error,
                );
                return {
                    success: false as const,
                    message: 'Server configuration error.',
                    code: 'SERVER_CONFIG' as const,
                };
            }
            logAuthServiceError('resendOtp', 'handler', 'app/routes/auth/service.ts', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    verify = async (phone_number: string, otp: string) => {
        try {
            const normalized = normalizePhoneForStorage(phone_number);
            const code = otp?.trim();
            if (!normalized || !code) {
                return { success: false as const, message: 'Phone number and OTP are required' };
            }

            const user = await prisma.users.findFirst({
                where: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                },
            });
            if (!user) {
                return { success: false as const, message: 'User not found. Start login first.' };
            }

            if (!user.otp_expires_at || user.otp_expires_at <= new Date()) {
                return {
                    success: false as const,
                    message: 'OTP expired or not requested. Request a new OTP from login or resend OTP.',
                };
            }

            if (!verifyOtpHash(code, user.otp_hash)) {
                return { success: false as const, message: 'Invalid OTP.' };
            }

            const wasCompletingRegistration = !user.is_verified;

            const updated = await prisma.users.update({
                where: { id: user.id },
                data: {
                    is_verified: true,
                    otp_hash: null,
                    otp_expires_at: null,
                },
                select: publicUserSelect,
            });

            const token = signAccessToken({
                sub: updated.id,
                phone_number: updated.phone_number,
            });

            return {
                success: true as const,
                message: 'Verified.',
                data: {
                    token,
                    user: updated,
                    flow: wasCompletingRegistration ? ('registration' as const) : ('login' as const),
                    is_onboarding_completed: updated.is_onboarding_completed,
                    onboarding_step: updated.onboarding_step,
                },
            };
        } catch (error) {
            if (error instanceof MissingJwtSecretError) {
                logAuthServiceError(
                    'verify',
                    'signAccessToken',
                    'app/utils/authToken.ts#signAccessToken',
                    error,
                );
                return {
                    success: false as const,
                    message: 'Server configuration error.',
                    code: 'SERVER_CONFIG' as const,
                };
            }
            if (error instanceof MissingOtpSecretError) {
                logAuthServiceError(
                    'verify',
                    'verifyOtpHash (server config)',
                    'app/utils/otpCrypto.ts#hashOtp',
                    error,
                );
                return {
                    success: false as const,
                    message: 'Server configuration error.',
                    code: 'SERVER_CONFIG' as const,
                };
            }
            logAuthServiceError('verify', 'handler', 'app/routes/auth/service.ts', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    submitOnboardingStep = async (userId: string, body: Record<string, unknown>) => {
        try {
            const step = body.step;
            if (step !== 1 && step !== 2) {
                return {
                    success: false as const,
                    message: 'step must be 1 (name & gender) or 2 (address).',
                    code: 'INVALID_STEP' as const,
                };
            }

            const user = await prisma.users.findFirst({
                where: { id: userId, is_active: true, is_deleted: false },
            });
            if (!user) {
                return { success: false as const, message: 'User not found.', code: 'USER_NOT_FOUND' as const };
            }
            if (!user.is_verified) {
                return {
                    success: false as const,
                    message: 'Verify your phone before onboarding.',
                    code: 'NOT_VERIFIED' as const,
                };
            }
            if (user.is_onboarding_completed) {
                return {
                    success: false as const,
                    message: 'Onboarding is already complete.',
                    code: 'ONBOARDING_COMPLETE' as const,
                };
            }

            if (step === 1) {
                if (user.onboarding_step !== 1) {
                    return {
                        success: false as const,
                        message: 'Step 1 is already done. Continue with step 2 (address).',
                        code: 'INVALID_STEP_ORDER' as const,
                    };
                }
                const nameRaw = body.name;
                if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
                    return { success: false as const, message: 'name is required.', code: 'VALIDATION' as const };
                }
                const name = nameRaw.trim();
                if (name.length > NAME_MAX_LEN) {
                    return {
                        success: false as const,
                        message: `name must be at most ${NAME_MAX_LEN} characters.`,
                        code: 'VALIDATION' as const,
                    };
                }
                const gender = normalizeGender(body.gender);
                if (!gender) {
                    return {
                        success: false as const,
                        message: 'gender must be one of: male, female, other.',
                        code: 'VALIDATION' as const,
                    };
                }

                const updated: PublicUser = await prisma.users.update({
                    where: { id: userId },
                    data: { name, gender, onboarding_step: 2 },
                    select: publicUserSelect,
                });
                return {
                    success: true as const,
                    message: 'Profile saved. Continue to address.',
                    data: updated,
                };
            }

            if (user.onboarding_step !== 2) {
                return {
                    success: false as const,
                    message: 'Complete step 1 (name & gender) first.',
                    code: 'INVALID_STEP_ORDER' as const,
                };
            }

            const addressCount = await prisma.address.count({ where: { user_id: userId } });

            if (addressCount < MAX_ADDRESSES_PER_USER) {
                const line1 = typeof body.line1 === 'string' ? body.line1.trim() : '';
                const area = typeof body.area === 'string' ? body.area.trim() : '';
                const city = typeof body.city === 'string' ? body.city.trim() : '';
                const pincode = typeof body.pincode === 'string' ? body.pincode.trim() : '';
                let label = 'Home';
                if (body.label !== undefined && body.label !== null) {
                    if (typeof body.label !== 'string' || !body.label.trim()) {
                        return {
                            success: false as const,
                            message: 'label must be a non-empty string when provided.',
                            code: 'VALIDATION' as const,
                        };
                    }
                    label = body.label.trim().slice(0, 120);
                }
                const lat = body.latitude;
                const lng = body.longitude;
                if (!line1) {
                    return { success: false as const, message: 'line1 is required.', code: 'VALIDATION' as const };
                }
                if (!area) {
                    return { success: false as const, message: 'area is required.', code: 'VALIDATION' as const };
                }
                if (!city) {
                    return { success: false as const, message: 'city is required.', code: 'VALIDATION' as const };
                }
                if (!pincode || !ONBOARDING_PINCODE.test(pincode)) {
                    return {
                        success: false as const,
                        message: 'pincode must be a 6-digit Indian PIN code.',
                        code: 'VALIDATION' as const,
                    };
                }
                if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
                    return {
                        success: false as const,
                        message: 'latitude and longitude must be numbers.',
                        code: 'VALIDATION' as const,
                    };
                }
                if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                    return {
                        success: false as const,
                        message: 'latitude must be -90..90 and longitude -180..180.',
                        code: 'VALIDATION' as const,
                    };
                }

                const makeDefault = addressCount === 0;
                const created = await prisma.address.create({
                    data: {
                        user_id: userId,
                        label,
                        line1,
                        area,
                        city,
                        pincode,
                        latitude: lat,
                        longitude: lng,
                        is_default: makeDefault,
                    },
                });
                if (makeDefault) {
                    await setOnlyDefaultAddress(userId, created.id);
                }
            }

            const updated: PublicUser = await prisma.users.update({
                where: { id: userId },
                data: {
                    onboarding_step: 2,
                    is_onboarding_completed: true,
                },
                select: publicUserSelect,
            });
            return {
                success: true as const,
                message: 'Onboarding complete.',
                data: updated,
            };
        } catch (error) {
            logAuthServiceError('submitOnboardingStep', 'handler', 'app/routes/auth/service.ts', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    getUser = async (userId: string) => {
        try {
            const user: PublicUser | null = await prisma.users.findFirst({
                where: {
                    id: userId,
                    is_active: true,
                    is_deleted: false,
                },
                select: publicUserSelect,
            });

            if (!user) {
                return {
                    success: false as const,
                    message: 'User not found.',
                    code: 'USER_NOT_FOUND' as const,
                };
            }

            return {
                success: true as const,
                message: 'User fetched successfully.',
                data: {
                    user,
                    is_onboarding_completed: user.is_onboarding_completed,
                    onboarding_step: user.onboarding_step,
                },
            };
        } catch (error) {
            logAuthServiceError('getUser', 'handler', 'app/routes/auth/service.ts', error);
            return {
                success: false as const,
                message: 'Internal server error. Please try again later.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default authService;
