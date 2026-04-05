import { prisma } from '../../utils/prisma';
import type { Discount } from '../../generated/prisma/client';

export type PublicDiscount = {
    id: string;
    title: string;
    code: string;
    percentage: number | null;
    amount: number | null;
    expires_at: string;
    usage_limit_total: number | null;
    uses_remaining: number | null;
    limit_label: string | null;
};

function toAmountNumber(value: Discount['amount']): number | null {
    if (value === null || value === undefined) return null;
    return Number(value);
}

function mapDiscount(row: Discount): PublicDiscount {
    const limit = row.usage_limit_total;
    const used = row.usage_count;
    const uses_remaining =
        limit === null || limit === undefined ? null : Math.max(0, limit - used);

    return {
        id: row.id,
        title: row.title,
        code: row.code,
        percentage: row.percentage,
        amount: toAmountNumber(row.amount),
        expires_at: row.expires_at.toISOString(),
        usage_limit_total: limit,
        uses_remaining,
        limit_label: row.limit_label,
    };
}

/**
 * `usage_limit_total == null` → unlimited redemptions; always eligible for the list (until expiry).
 * Otherwise require `usage_count < usage_limit_total` so exhausted codes (0 remaining) are excluded.
 */
function hasRedemptionCapacity(row: Discount): boolean {
    if (row.usage_limit_total == null) return true;
    return row.usage_count < row.usage_limit_total;
}

function isDiscountCurrentlyValid(row: Discount, now: Date): boolean {
    if (!row.is_active || row.is_deleted) return false;
    if (row.expires_at <= now) return false;
    if (!hasRedemptionCapacity(row)) return false;
    return true;
}

class discountService {
    listAvailable = async (): Promise<{ success: true; data: PublicDiscount[] } | { success: false; message: string }> => {
        try {
            const now = new Date();
            const rows = await prisma.discount.findMany({
                where: {
                    is_active: true,
                    is_deleted: false,
                    expires_at: { gt: now },
                },
                orderBy: { expires_at: 'asc' },
            });
            const data = rows.filter((r) => isDiscountCurrentlyValid(r, now)).map(mapDiscount);
            return { success: true, data };
        } catch (e) {
            console.error('[discounts] listAvailable', e);
            return { success: false, message: 'Could not load discounts.' };
        }
    };

    getByCode = async (
        rawCode: string,
    ): Promise<
        | { success: true; data: PublicDiscount }
        | { success: false; message: string; code: 'NOT_FOUND' | 'INVALID' | 'SERVER' }
    > => {
        const code = rawCode?.trim().toUpperCase();
        if (!code) {
            return { success: false, message: 'Discount code is required.', code: 'INVALID' };
        }
        try {
            const row = await prisma.discount.findUnique({ where: { code } });
            if (!row) {
                return { success: false, message: 'Invalid or unknown discount code.', code: 'NOT_FOUND' };
            }
            const now = new Date();
            if (!isDiscountCurrentlyValid(row, now)) {
                return {
                    success: false,
                    message:
                        'This discount is inactive, removed, expired, or has reached its usage limit.',
                    code: 'INVALID',
                };
            }
            return { success: true, data: mapDiscount(row) };
        } catch (e) {
            console.error('[discounts] getByCode', e);
            return { success: false, message: 'Could not look up discount.', code: 'SERVER' };
        }
    };
}

/** For booking coupon apply — returns DB row when code is valid and has redemption capacity. */
export async function loadApplicableDiscountRow(
    rawCode: string,
): Promise<
    | { ok: true; row: Discount }
    | { ok: false; message: string; code: 'INVALID' | 'NOT_FOUND' | 'SERVER' }
> {
    const code = rawCode?.trim().toUpperCase();
    if (!code) {
        return { ok: false, message: 'Discount code is required.', code: 'INVALID' };
    }
    try {
        const row = await prisma.discount.findUnique({ where: { code } });
        if (!row) {
            return { ok: false, message: 'Invalid or unknown discount code.', code: 'NOT_FOUND' };
        }
        const now = new Date();
        if (!isDiscountCurrentlyValid(row, now)) {
            return {
                ok: false,
                message: 'This discount is not valid or no longer available.',
                code: 'INVALID',
            };
        }
        return { ok: true, row };
    } catch (e) {
        console.error('[discounts] loadApplicableDiscountRow', e);
        return { ok: false, message: 'Could not validate coupon.', code: 'SERVER' };
    }
}

export default discountService;
