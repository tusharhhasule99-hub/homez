import type { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../../utils/prisma';
import { paginateResult } from '../../../utils/pagination';

const adminAddressInclude = {
    user: { select: { id: true, name: true, phone_number: true } },
} as const;

type AddressRow = Prisma.AddressGetPayload<{ include: typeof adminAddressInclude }>;

export type AdminLocation = {
    id: string;
    user_id: string;
    user: { id: string; name: string | null; phone_number: string };
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

const PINCODE_IN = /^\d{6}$/;

function mapAddress(row: AddressRow): AdminLocation {
    return {
        id: row.id,
        user_id: row.user_id,
        user: { id: row.user.id, name: row.user.name, phone_number: row.user.phone_number },
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

function validateCoords(lat: number, lng: number): string | null {
    if (Number.isNaN(lat) || Number.isNaN(lng)) return 'latitude and longitude must be valid numbers.';
    if (lat < -90 || lat > 90) return 'latitude must be between -90 and 90.';
    if (lng < -180 || lng > 180) return 'longitude must be between -180 and 180.';
    return null;
}

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
    if (first) await setOnlyDefault(userId, first.id);
}

class adminLocationsService {
    list = async (opts: {
        userId?: string | null;
        q?: string | null;
        page: number;
        pageSize: number;
        skip: number;
    }) => {
        try {
            const where: Prisma.AddressWhereInput = {};
            if (opts.userId) where.user_id = opts.userId;
            if (opts.q && opts.q.trim()) {
                const q = opts.q.trim();
                where.OR = [
                    { label: { contains: q, mode: 'insensitive' } },
                    { line1: { contains: q, mode: 'insensitive' } },
                    { area: { contains: q, mode: 'insensitive' } },
                    { city: { contains: q, mode: 'insensitive' } },
                    { pincode: { contains: q } },
                    { user: { name: { contains: q, mode: 'insensitive' } } },
                    { user: { phone_number: { contains: q } } },
                ];
            }

            const [total, rows] = await Promise.all([
                prisma.address.count({ where }),
                prisma.address.findMany({
                    where,
                    orderBy: [{ created_at: 'desc' }],
                    skip: opts.skip,
                    take: opts.pageSize,
                    include: adminAddressInclude,
                }),
            ]);
            return {
                success: true as const,
                message: 'OK',
                data: paginateResult(rows.map(mapAddress), total, opts.page, opts.pageSize),
            };
        } catch (e) {
            console.error('[admin locations] list', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    getById = async (id: string) => {
        try {
            const row = await prisma.address.findFirst({ where: { id }, include: adminAddressInclude });
            if (!row) {
                return { success: false as const, message: 'Location not found.', code: 'NOT_FOUND' as const };
            }
            return { success: true as const, message: 'OK', data: mapAddress(row) };
        } catch (e) {
            console.error('[admin locations] getById', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    create = async (body: Record<string, unknown>) => {
        try {
            const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
            if (!userId) {
                return { success: false as const, message: 'user_id is required.', code: 'VALIDATION' as const };
            }
            const user = await prisma.users.findFirst({ where: { id: userId, is_deleted: false } });
            if (!user) {
                return { success: false as const, message: 'User not found.', code: 'NOT_FOUND' as const };
            }

            const label = typeof body.label === 'string' ? body.label.trim() : '';
            const line1 = typeof body.line1 === 'string' ? body.line1.trim() : '';
            const area = typeof body.area === 'string' ? body.area.trim() : '';
            const city = typeof body.city === 'string' ? body.city.trim() : '';
            const pincode = typeof body.pincode === 'string' ? body.pincode.trim() : '';
            const latitude = typeof body.latitude === 'number' ? body.latitude : Number(body.latitude);
            const longitude = typeof body.longitude === 'number' ? body.longitude : Number(body.longitude);
            const is_default = typeof body.is_default === 'boolean' ? body.is_default : false;

            if (!label || !line1 || !area || !city || !pincode) {
                return {
                    success: false as const,
                    message: 'label, line1, area, city, and pincode are required.',
                    code: 'VALIDATION' as const,
                };
            }
            if (!PINCODE_IN.test(pincode)) {
                return {
                    success: false as const,
                    message: 'pincode must be a 6-digit Indian PIN code.',
                    code: 'VALIDATION' as const,
                };
            }
            const coordErr = validateCoords(latitude, longitude);
            if (coordErr) return { success: false as const, message: coordErr, code: 'VALIDATION' as const };

            const created = await prisma.address.create({
                data: {
                    user_id: userId,
                    label,
                    line1,
                    area,
                    city,
                    pincode,
                    latitude,
                    longitude,
                    is_default,
                },
                include: adminAddressInclude,
            });

            if (is_default) {
                await setOnlyDefault(userId, created.id);
            } else {
                const defaults = await prisma.address.count({
                    where: { user_id: userId, is_default: true },
                });
                if (defaults === 0) {
                    await setOnlyDefault(userId, created.id);
                }
            }

            const row = await prisma.address.findFirstOrThrow({
                where: { id: created.id },
                include: adminAddressInclude,
            });
            return { success: true as const, message: 'Location created.', data: mapAddress(row) };
        } catch (e) {
            console.error('[admin locations] create', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    update = async (id: string, body: Record<string, unknown>) => {
        try {
            const existing = await prisma.address.findFirst({ where: { id } });
            if (!existing) {
                return { success: false as const, message: 'Location not found.', code: 'NOT_FOUND' as const };
            }

            const patch: Prisma.AddressUpdateInput = {};
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
                return {
                    success: false as const,
                    message: 'No valid fields to update.',
                    code: 'VALIDATION' as const,
                };
            }

            const next = {
                label: typeof patch.label === 'string' ? patch.label : existing.label,
                line1: typeof patch.line1 === 'string' ? patch.line1 : existing.line1,
                area: typeof patch.area === 'string' ? patch.area : existing.area,
                city: typeof patch.city === 'string' ? patch.city : existing.city,
                pincode: typeof patch.pincode === 'string' ? patch.pincode : existing.pincode,
                latitude:
                    typeof patch.latitude === 'number'
                        ? patch.latitude
                        : existing.latitude,
                longitude:
                    typeof patch.longitude === 'number'
                        ? patch.longitude
                        : existing.longitude,
            };

            if (typeof patch.pincode === 'string' && !PINCODE_IN.test(next.pincode)) {
                return {
                    success: false as const,
                    message: 'pincode must be a 6-digit Indian PIN code.',
                    code: 'VALIDATION' as const,
                };
            }
            const coordErr = validateCoords(next.latitude, next.longitude);
            if (coordErr) return { success: false as const, message: coordErr, code: 'VALIDATION' as const };
            if (!next.label || !next.line1 || !next.area || !next.city || !next.pincode) {
                return {
                    success: false as const,
                    message: 'label, line1, area, city, and pincode cannot be empty.',
                    code: 'VALIDATION' as const,
                };
            }

            await prisma.address.update({ where: { id }, data: patch });

            if (patch.is_default === true) {
                await setOnlyDefault(existing.user_id, id);
            }

            const defaultCount = await prisma.address.count({
                where: { user_id: existing.user_id, is_default: true },
            });
            if (defaultCount === 0) {
                await promoteFirstAsDefault(existing.user_id);
            }

            const row = await prisma.address.findFirstOrThrow({ where: { id }, include: adminAddressInclude });
            return { success: true as const, message: 'Location updated.', data: mapAddress(row) };
        } catch (e) {
            console.error('[admin locations] update', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };

    delete = async (id: string) => {
        try {
            const existing = await prisma.address.findFirst({ where: { id } });
            if (!existing) {
                return { success: false as const, message: 'Location not found.', code: 'NOT_FOUND' as const };
            }
            const wasDefault = existing.is_default;
            const userId = existing.user_id;
            await prisma.address.delete({ where: { id } });
            if (wasDefault) {
                await promoteFirstAsDefault(userId);
            }
            return { success: true as const, message: 'Location deleted.' };
        } catch (e) {
            console.error('[admin locations] delete', e);
            return {
                success: false as const,
                message: 'Internal server error.',
                code: 'INTERNAL_SERVER_ERROR' as const,
            };
        }
    };
}

export default adminLocationsService;
