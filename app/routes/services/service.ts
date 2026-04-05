import { prisma } from '../../utils/prisma';
import type { Service, Slot } from '../../generated/prisma/client';
import type { SlotType } from '../../generated/prisma/enums';

const servicePublicWhere = {
    is_active: true,
    is_deleted: false,
} as const;

const slotPublicWhere = {
    is_active: true,
    is_deleted: false,
} as const;

export type PublicSlot = {
    id: string;
    slot_type: SlotType;
    duration_label: string;
    duration_minutes: number;
    price: number;
    slash_price: number | null;
    sort_order: number;
};

export type SlotsFilter = 'instant' | 'scheduled' | 'all';

export type PublicService = {
    id: string;
    slug: string;
    title: string;
    description: string;
    image_url: string;
    dos: string[];
    donts: string[];
    sort_order: number;
    /** Included when slots were loaded; filtered by `slot_type` query (default **instant**). */
    slots?: PublicSlot[];
};

function asStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((x): x is string => typeof x === 'string');
}

function toPrice(v: Slot['price'] | Slot['slash_price']): number | null {
    if (v === null || v === undefined) return null;
    return Number(v);
}

function mapSlot(row: Slot): PublicSlot {
    return {
        id: row.id,
        slot_type: row.slot_type,
        duration_label: row.duration_label,
        duration_minutes: row.duration_minutes,
        price: toPrice(row.price)!,
        slash_price: toPrice(row.slash_price),
        sort_order: row.sort_order,
    };
}

function mapService(row: Service, slots: Slot[] | undefined, slotsFilter: SlotsFilter | null): PublicService {
    const base: PublicService = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        image_url: row.image_url,
        dos: asStringList(row.dos),
        donts: asStringList(row.donts),
        sort_order: row.sort_order,
    };
    if (slots !== undefined && slotsFilter !== null) {
        let list = slots.filter((s) => s.is_active && !s.is_deleted);
        if (slotsFilter === 'instant') {
            list = list.filter((s) => s.slot_type === 'instant');
        } else if (slotsFilter === 'scheduled') {
            list = list.filter((s) => s.slot_type === 'scheduled');
        }
        list.sort((a, b) => a.sort_order - b.sort_order);
        base.slots = list.map(mapSlot);
    }
    return base;
}

function slotWhereForFilter(filter: SlotsFilter) {
    if (filter === 'all') {
        return { ...slotPublicWhere };
    }
    return { ...slotPublicWhere, slot_type: filter };
}

class catalogService {
    list = async (includeSlots: boolean, slotsFilter: SlotsFilter) => {
        try {
            const rows = await prisma.service.findMany({
                where: servicePublicWhere,
                orderBy: { sort_order: 'asc' },
                include: includeSlots
                    ? {
                          slots: {
                              where: slotWhereForFilter(slotsFilter),
                              orderBy: { sort_order: 'asc' },
                          },
                      }
                    : undefined,
            });
            const data: PublicService[] = rows.map((r) => {
                const slotRows: Slot[] | undefined =
                    includeSlots && 'slots' in r && Array.isArray(r.slots) ? r.slots : undefined;
                return mapService(r, slotRows, includeSlots ? slotsFilter : null);
            });
            return { success: true as const, data };
        } catch (e) {
            console.error('[services] list', e);
            return { success: false as const, message: 'Could not load services.' };
        }
    };

    getById = async (id: string, slotsFilter: SlotsFilter) => {
        try {
            const row = await prisma.service.findFirst({
                where: { id, ...servicePublicWhere },
                include: {
                    slots: {
                        where: slotWhereForFilter(slotsFilter),
                        orderBy: { sort_order: 'asc' },
                    },
                },
            });
            if (!row) {
                return { success: false as const, message: 'Service not found.', code: 'NOT_FOUND' as const };
            }
            return { success: true as const, data: mapService(row, row.slots, slotsFilter) };
        } catch (e) {
            console.error('[services] getById', e);
            return { success: false as const, message: 'Could not load service.', code: 'SERVER' as const };
        }
    };
}

export default catalogService;
