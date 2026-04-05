/**
 * Strips a leading India country code (+91) for storage. Other input is trimmed only.
 */
export function normalizePhoneForStorage(raw: string): string {
    let s = raw.trim();
    if (s.startsWith('+91')) {
        s = s.slice(3).trimStart();
    }
    return s;
}

/** E.164 for India SMS (stored national number → +91…). */
export function toIndiaE164(normalizedNational: string): string {
    const digits = normalizedNational.replace(/\D/g, '');
    return `+91${digits}`;
}
