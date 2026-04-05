import { prisma } from '../../utils/prisma';
import { normalizePhoneForStorage } from '../../utils/phone';
import { generateOtpCode, hashOtp, verifyOtpHash, MissingOtpSecretError, OTP_TTL_MS } from '../../utils/otpCrypto';
import { sendOtpSms } from '../../services/twilioOtpSms';
import { signAccessToken, MissingJwtSecretError } from '../../utils/authToken';
import { logAuthServiceError } from '../../utils/logAuthServiceError';
import { publicUserSelect, type PublicUser } from './userPublic';

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
                    select: publicUserSelect,
                });
                return {
                    success: true as const,
                    created: false as const,
                    message: 'OTP sent. Verify to complete registration.',
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
                select: publicUserSelect,
            });
            return {
                success: true as const,
                created: true as const,
                message: 'OTP sent. Verify to complete registration.',
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
            const publicUser: PublicUser = await prisma.users.findUniqueOrThrow({
                where: { id: user.id },
                select: publicUserSelect,
            });
            return {
                success: true as const,
                message: 'OTP sent. Verify to sign in.',
                data: publicUser,
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
                message: wasCompletingRegistration
                    ? 'Registration complete. You are signed in.'
                    : 'Signed in successfully.',
                data: {
                    token,
                    user: updated,
                    flow: wasCompletingRegistration ? ('registration' as const) : ('login' as const),
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
}

export default authService;
