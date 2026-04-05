import twilio from 'twilio';
import { toIndiaE164 } from '../utils/phone';

function isDevLogOnly(): boolean {
    return process.env.OTP_DEV_LOG_ONLY === 'true' || process.env.OTP_DEV_LOG_ONLY === '1';
}

function hasTwilioConfig(): boolean {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    return Boolean(sid && token && from && !sid.includes('0000000000'));
}

/**
 * Sends OTP via Twilio SMS to an Indian national stored number, or logs in dev.
 */
export async function sendOtpSms(normalizedNationalPhone: string, otpCode: string): Promise<void> {
    const to = toIndiaE164(normalizedNationalPhone);
    const body = `Your HomeZ verification code is ${otpCode}. It expires in 10 minutes.`;

    if (isDevLogOnly() || !hasTwilioConfig()) {
        console.log(`[OTP SMS] to=${to} ${body}`);
        return;
    }

    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_PHONE_NUMBER!;

    const client = twilio(sid, token);
    await client.messages.create({ body, from, to });
}
