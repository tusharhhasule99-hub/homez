import express from 'express';
import { sendError, sendSuccess } from '../../utils/sendResponse';
import catalogService, { type SlotsFilter } from './service';

function parseIncludeSlots(query: express.Request['query']): boolean {
    const v = query.include_slots ?? query.includeSlots;
    if (v === undefined || v === null) return false;
    const s = Array.isArray(v) ? v[0] : v;
    return s === 'true' || s === '1' || s === 'yes';
}

function parseSlotType(query: express.Request['query']): SlotsFilter {
    const v = query.slot_type ?? query.slotType;
    const raw = (Array.isArray(v) ? v[0] : v)?.toString().toLowerCase().trim();
    if (raw === 'scheduled') return 'scheduled';
    if (raw === 'all' || raw === 'both') return 'all';
    return 'instant';
}

class servicesController {
    private catalogService: catalogService;
    constructor() {
        this.catalogService = new catalogService();
    }

    list = async (req: express.Request, res: express.Response) => {
        const includeSlots = parseIncludeSlots(req.query);
        const slotsFilter = parseSlotType(req.query);
        const result = await this.catalogService.list(includeSlots, slotsFilter);
        if (!result.success) {
            return sendError(res, 500, result.message, 'SERVICE_LIST_FAILED');
        }
        return sendSuccess(res, 200, 'OK', result.data);
    };

    getById = async (req: express.Request, res: express.Response) => {
        const raw = req.params.id;
        const id = Array.isArray(raw) ? raw[0] : raw;
        if (!id?.trim()) {
            return sendError(res, 400, 'Service id is required.', 'VALIDATION');
        }
        const slotsFilter = parseSlotType(req.query);
        const result = await this.catalogService.getById(id.trim(), slotsFilter);
        if (!result.success) {
            const status = result.code === 'NOT_FOUND' ? 404 : 500;
            return sendError(res, status, result.message, result.code);
        }
        return sendSuccess(res, 200, 'OK', result.data);
    };
}

export default servicesController;
