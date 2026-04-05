import twilio from 'twilio';
import { toIndiaE164 } from '../utils/phone';

function isProductionBackend(): boolean {
    return process.env.NODE_ENV === 'production';
}

function hasTwilioConfig(): boolean {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    return Boolean(sid && token && from && !sid.includes('0000000000'));
}

/**
 * Sends OTP via Twilio SMS (production only). Non-production uses a static dev OTP in auth; this is not called then.
 */
export async function sendOtpSms(normalizedNationalPhone: string, otpCode: string): Promise<void> {
    if (!isProductionBackend()) {
        return;
    }

    const to = toIndiaE164(normalizedNationalPhone);
    const body = `Your HomeZ verification code is ${otpCode}. It expires in 10 minutes.`;

    if (!hasTwilioConfig()) {
        console.warn(`[OTP SMS] production but Twilio env missing; would send to=${to}`);
        return;
    }

    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_PHONE_NUMBER!;

    const client = twilio(sid, token);
    await client.messages.create({ body, from, to });
}
