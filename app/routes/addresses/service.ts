import { prisma } from '../../utils/prisma';
import type { Address } from '../../generated/prisma/client';

export const MAX_ADDRESSES_PER_USER = 3;

export type PublicAddress = {
    id: string;
    user_id: string;
    label: string;
    line1: string;
    area: string;
    city: string;
    pincode: string;
    latitude: number;
    longitude: number;
    is_default: boolean;
    created_at: string;
    updated_at: string;
};

function mapAddress(row: Address): PublicAddress {
    return {
        id: row.id,
        user_id: row.user_id,
        label: row.label,
        line1: row.line1,
        area: row.area,
        city: row.city,
        pincode: row.pincode,
        latitude: row.latitude,
        longitude: row.longitude,
        is_default: row.is_default,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
    };
}

const PINCODE_IN = /^\d{6}$/;

function validateCoords(lat: number, lng: number): string | null {
    if (Number.isNaN(lat) || Number.isNaN(lng)) return 'latitude and longitude must be valid numbers.';
    if (lat < -90 || lat > 90) return 'latitude must be between -90 and 90.';
    if (lng < -180 || lng > 180) return 'longitude must be between -180 and 180.';
    return null;
}

function validateCreateBody(body: Record<string, unknown>): { ok: true; data: CreateAddressInput } | { ok: false; message: string } {
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    const line1 = typeof body.line1 === 'string' ? body.line1.trim() : '';
    const area = typeof body.area === 'string' ? body.area.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const pincode = typeof body.pincode === 'string' ? body.pincode.trim() : '';
    const lat = typeof body.latitude === 'number' ? body.latitude : Number(body.latitude);
    const lng = typeof body.longitude === 'number' ? body.longitude : Number(body.longitude);
    const is_default = body.is_default === true;

    if (!label) return { ok: false, message: 'label is required.' };
    if (!line1) return { ok: false, message: 'line1 is required.' };
    if (!area) return { ok: false, message: 'area is required.' };
    if (!city) return { ok: false, message: 'city is required.' };
    if (!pincode) return { ok: false, message: 'pincode is required.' };
    if (!PINCODE_IN.test(pincode)) return { ok: false, message: 'pincode must be a 6-digit Indian PIN code.' };

    const coordErr = validateCoords(lat, lng);
    if (coordErr) return { ok: false, message: coordErr };

    return {
        ok: true,
        data: { label, line1, area, city, pincode, latitude: lat, longitude: lng, is_default },
    };
}

type CreateAddressInput = {
    label: string;
    line1: string;
    area: string;
    city: string;
    pincode: string;
    latitude: number;
    longitude: number;
    is_default: boolean;
};

async function setOnlyDefault(userId: string, addressId: string): Promise<void> {
    await prisma.$transaction([
        prisma.address.updateMany({ where: { user_id: userId }, data: { is_default: false } }),
        prisma.address.update({ where: { id: addressId }, data: { is_default: true } }),
    ]);
}

async function promoteFirstAsDefault(userId: string): Promise<void> {
    const first = await prisma.address.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: 'asc' },
        select: { id: true },
    });
    if (first) {
        await setOnlyDefault(userId, first.id);
    }
}

class addressService {
    list = async (userId: string) => {
        try {
            const rows = await prisma.address.findMany({
                where: { user_id: userId },
                orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
            });
            return { success: true as const, data: rows.map(mapAddress) };
        } catch (e) {
            console.error('[addresses] list', e);
            return { success: false as const, message: 'Could not load addresses.' };
        }
    };

    getById = async (userId: string, addressId: string) => {
        try {
            const row = await prisma.address.findFirst({
                where: { id: addressId, user_id: userId },
            });
            if (!row) {
                return { success: false as const, message: 'Address not found.', code: 'NOT_FOUND' as const };
            }
            return { success: true as const, data: mapAddress(row) };
        } catch (e) {
            console.error('[addresses] getById', e);
            return { success: false as const, message: 'Could not load address.', code: 'SERVER' as const };
        }
    };

    create = async (userId: string, body: Record<string, unknown>) => {
        const parsed = validateCreateBody(body);
        if (!parsed.ok) {
            return { success: false as const, message: parsed.message, code: 'VALIDATION' as const };
        }
        try {
            const count = await prisma.address.count({ where: { user_id: userId } });
            if (count >= MAX_ADDRESSES_PER_USER) {
                return {
                    success: false as const,
                    message: `You can save at most ${MAX_ADDRESSES_PER_USER} addresses.`,
                    code: 'ADDRESS_LIMIT' as const,
                };
            }

            const { data } = parsed;
            const makeDefault = data.is_default || count === 0;

            const created = await prisma.address.create({
                data: {
                    user_id: userId,
                    label: data.label,
                    line1: data.line1,
                    area: data.area,
                    city: data.city,
                    pincode: data.pincode,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    is_default: makeDefault,
                },
            });

            if (makeDefault) {
                await setOnlyDefault(userId, created.id);
            }

            const final = await prisma.address.findUniqueOrThrow({ where: { id: created.id } });
            return { success: true as const, data: mapAddress(final) };
        } catch (e) {
            console.error('[addresses] create', e);
            return { success: false as const, message: 'Could not create address.', code: 'SERVER' as const };
        }
    };

    update = async (userId: string, addressId: string, body: Record<string, unknown>) => {
        try {
            const existing = await prisma.address.findFirst({
                where: { id: addressId, user_id: userId },
            });
            if (!existing) {
                return { success: false as const, message: 'Address not found.', code: 'NOT_FOUND' as const };
            }

            const patch: Partial<CreateAddressInput> & { is_default?: boolean } = {};
            if (typeof body.label === 'string') patch.label = body.label.trim();
            if (typeof body.line1 === 'string') patch.line1 = body.line1.trim();
            if (typeof body.area === 'string') patch.area = body.area.trim();
            if (typeof body.city === 'string') patch.city = body.city.trim();
            if (typeof body.pincode === 'string') patch.pincode = body.pincode.trim();
            if (body.latitude !== undefined) {
                const lat = typeof body.latitude === 'number' ? body.latitude : Number(body.latitude);
                patch.latitude = lat;
            }
            if (body.longitude !== undefined) {
                const lng = typeof body.longitude === 'number' ? body.longitude : Number(body.longitude);
                patch.longitude = lng;
            }
            if (typeof body.is_default === 'boolean') patch.is_default = body.is_default;

            if (Object.keys(patch).length === 0) {
                return { success: false as const, message: 'No valid fields to update.', code: 'VALIDATION' as const };
            }

            const next = {
                label: patch.label ?? existing.label,
                line1: patch.line1 ?? existing.line1,
                area: patch.area ?? existing.area,
                city: patch.city ?? existing.city,
                pincode: patch.pincode ?? existing.pincode,
                latitude: patch.latitude ?? existing.latitude,
                longitude: patch.longitude ?? existing.longitude,
            };

            if (patch.pincode !== undefined && !PINCODE_IN.test(next.pincode)) {
                return { success: false as const, message: 'pincode must be a 6-digit Indian PIN code.', code: 'VALIDATION' as const };
            }
            const coordErr = validateCoords(next.latitude, next.longitude);
            if (coordErr) return { success: false as const, message: coordErr, code: 'VALIDATION' as const };
            if (!next.label || !next.line1 || !next.area || !next.city || !next.pincode) {
                return { success: false as const, message: 'label, line1, area, city, and pincode cannot be empty.', code: 'VALIDATION' as const };
            }

            await prisma.address.update({
                where: { id: addressId },
                data: {
                    label: next.label,
                    line1: next.line1,
                    area: next.area,
                    city: next.city,
                    pincode: next.pincode,
                    latitude: next.latitude,
                    longitude: next.longitude,
                    ...(patch.is_default === true ? { is_default: true } : patch.is_default === false ? { is_default: false } : {}),
                },
            });

            if (patch.is_default === true) {
                await setOnlyDefault(userId, addressId);
            }

            const defaultCount = await prisma.address.count({
                where: { user_id: userId, is_default: true },
            });
            if (defaultCount === 0) {
                await promoteFirstAsDefault(userId);
            }

            const row = await prisma.address.findUniqueOrThrow({ where: { id: addressId } });
            return { success: true as const, data: mapAddress(row) };
        } catch (e) {
            console.error('[addresses] update', e);
            return { success: false as const, message: 'Could not update address.', code: 'SERVER' as const };
        }
    };

    delete = async (userId: string, addressId: string) => {
        try {
            const existing = await prisma.address.findFirst({
                where: { id: addressId, user_id: userId },
            });
            if (!existing) {
                return { success: false as const, message: 'Address not found.', code: 'NOT_FOUND' as const };
            }

            const wasDefault = existing.is_default;
            await prisma.address.delete({ where: { id: addressId } });

            if (wasDefault) {
                await promoteFirstAsDefault(userId);
            }

            return { success: true as const, data: { id: addressId } };
        } catch (e) {
            console.error('[addresses] delete', e);
            return { success: false as const, message: 'Could not delete address.', code: 'SERVER' as const };
        }
    };
}

export default addressService;
