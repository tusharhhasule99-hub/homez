import { createHash, randomInt, timingSafeEqual } from 'crypto';

const OTP_LENGTH = 6;

export class MissingOtpSecretError extends Error {
    readonly code = 'MISSING_OTP_SECRET';
    constructor() {
        super('OTP_HASH_SECRET is not set (add to .env)');
        this.name = 'MissingOtpSecretError';
    }
}

export function generateOtpCode(): string {
    const n = randomInt(0, 1_000_000);
    return String(n).padStart(OTP_LENGTH, '0');
}

export function hashOtp(plain: string): string {
    const secret = process.env.OTP_HASH_SECRET ?? '';
    if (!secret) {
        throw new MissingOtpSecretError();
    }
    return createHash('sha256').update(`${secret}:${plain}`, 'utf8').digest('hex');
}

export function verifyOtpHash(plain: string, storedHash: string | null | undefined): boolean {
    if (!storedHash) {
        return false;
    }
    let computed: string;
    try {
        computed = hashOtp(plain);
    } catch {
        return false;
    }
    try {
        const a = Buffer.from(computed, 'hex');
        const b = Buffer.from(storedHash, 'hex');
        if (a.length !== b.length) {
            return false;
        }
        return timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

export const OTP_TTL_MS = 10 * 60 * 1000;
