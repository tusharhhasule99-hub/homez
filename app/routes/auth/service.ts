import { prisma } from '../../utils/prisma';
import { normalizePhoneForStorage } from '../../utils/phone';
import { generateOtpCode, hashOtp, verifyOtpHash, MissingOtpSecretError, OTP_TTL_MS } from '../../utils/otpCrypto';
import { sendOtpSms } from '../../services/twilioOtpSms';
import { signAccessToken, MissingJwtSecretError } from '../../utils/authToken';
import { logAuthServiceError } from '../../utils/logAuthServiceError';
import { otpSentUserSelect, publicUserSelect, type OtpSentUser, type PublicUser } from './userPublic';

const ALLOWED_GENDERS = new Set(['male', 'female', 'other']);
const NAME_MAX_LEN = 200;

function otpExpiry(): Date {
    return new Date(Date.now() + OTP_TTL_MS);
}

async function persistOtpAndSend(userId: string, normalizedPhone: string): Promise<void> {
    const code = generateOtpCode();
    const hash = hashOtp(code);
    await prisma.users.update({
        where: { id: userId },
        data: { otp_hash: hash, otp_expires_at: otpExpiry() },
    });
    await sendOtpSms(normalizedPhone, code);
}

function normalizeGender(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const g = raw.trim().toLowerCase();
    return ALLOWED_GENDERS.has(g) ? g : null;
}

class authService {
    constructor() {}

    register = async (phone_number: string) => {
        try {
            const normalized = normalizePhoneForStorage(phone_number);
            if (!normalized) {
                return { success: false as const, message: 'Phone number is required', code: 'INVALID_PHONE_NUMBER' as const };
            }

            const verified = await prisma.users.findFirst({
                where: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                    is_verified: true,
                },
                select: { id: true },
            });
            if (verified) {
                return {
                    success: false as const,
                    message: 'Account already exists. Use login to receive an OTP.',
                    code: 'USER_ALREADY_EXISTS' as const,
                };
            }

            const pending = await prisma.users.findFirst({
                where: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                    is_verified: false,
                },
            });

            if (pending) {
                await persistOtpAndSend(pending.id, normalized);
                const user = await prisma.users.findUniqueOrThrow({
                    where: { id: pending.id },
                    select: otpSentUserSelect,
                });
                return {
                    success: true as const,
                    created: false as const,
                    message: 'OTP sent. Verify your number to continue.',
                    data: user,
                };
            }

            const created = await prisma.users.create({
                data: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                    is_verified: false,
                },
            });
            await persistOtpAndSend(created.id, normalized);
            const user = await prisma.users.findUniqueOrThrow({
                where: { id: created.id },
                select: otpSentUserSelect,
            });
            return {
                success: true as const,
                created: true as const,
                message: 'OTP sent. Verify your number to continue.',
                data: user,
            };
        } catch (error) {
            if (error instanceof MissingOtpSecretError) {
                logAuthServiceError(
                    'register',
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
            logAuthServiceError('register', 'handler', 'app/routes/auth/service.ts', error);
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
                return { success: false as const, message: 'Phone number is required' };
            }

            const user = await prisma.users.findFirst({
                where: {
                    phone_number: normalized,
                    is_active: true,
                    is_deleted: false,
                    is_verified: true,
                },
            });
            if (!user) {
                return {
                    success: false as const,
                    message: 'No verified account for this number. Register first.',
                };
            }

            await persistOtpAndSend(user.id, normalized);
            const slim: OtpSentUser = await prisma.users.findUniqueOrThrow({
                where: { id: user.id },
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
                return { success: false as const, message: 'User not found. Register first.' };
            }

            if (!user.otp_expires_at || user.otp_expires_at <= new Date()) {
                return {
                    success: false as const,
                    message: 'OTP expired or not requested. Request a new code from register or login.',
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

            const addrRaw = body.address_formatted;
            if (typeof addrRaw !== 'string' || !addrRaw.trim()) {
                return {
                    success: false as const,
                    message: 'address_formatted is required.',
                    code: 'VALIDATION' as const,
                };
            }
            const address_formatted = addrRaw.trim();

            let address_label = 'Home';
            if (body.address_label !== undefined && body.address_label !== null) {
                if (typeof body.address_label !== 'string' || !body.address_label.trim()) {
                    return {
                        success: false as const,
                        message: 'address_label must be a non-empty string when provided.',
                        code: 'VALIDATION' as const,
                    };
                }
                address_label = body.address_label.trim().slice(0, 120);
            }

            const lat = body.latitude;
            const lng = body.longitude;
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

            const updated: PublicUser = await prisma.users.update({
                where: { id: userId },
                data: {
                    address_label,
                    address_formatted,
                    latitude: lat,
                    longitude: lng,
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
}

export default authService;
