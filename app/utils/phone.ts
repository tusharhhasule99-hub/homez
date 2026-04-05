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
